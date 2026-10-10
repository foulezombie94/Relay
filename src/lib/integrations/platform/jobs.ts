import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Job, JobResult } from "@/lib/jobs/types";
import { PermanentJobError } from "@/lib/jobs/types";
import { IntegrationStore } from "./store";
import { IntegrationRuntime, bindingFor, hashInput } from "./runtime";
import { providerFor } from "./registry";
import { decrypt, encrypt, openCredentials } from "./vault";
import { sanitizeConnection, type Actor } from "./contracts";
import { IntegrationError } from "./errors";
import { gmailNotificationSchema } from "./providers/gmail-pubsub";

export async function integrationJob(admin: SupabaseClient, job: Job): Promise<JobResult> {
  if (!job.user_id) throw new PermanentJobError("missing_subject");
  const actor: Actor = {
    userId: job.user_id,
    workspaceId: job.workspace_id,
    source: "user",
    correlationId: randomUUID(),
  };
  const connectionId = z.uuid().parse(job.payload.connection_id),
    store = new IntegrationStore(admin),
    runtime = new IntegrationRuntime(store, providerFor);
  try {
    if (job.type === "integration_revoke") {
      const row = z
        .object({
          connection: z.record(z.string(), z.unknown()),
          encrypted_credentials: z.string().nullable(),
          subscriptions: z.array(z.string()),
        })
        .parse(await store.call(actor, "revoke_load", { connection_id: connectionId }));
      const connection = sanitizeConnection(row.connection),
        binding = {
          workspaceId: actor.workspaceId,
          connectionId,
          provider: connection.provider,
          externalAccountId: connection.external_account_id,
          purpose: "credentials" as const,
        };
      const credentials = row.encrypted_credentials
        ? openCredentials(row.encrypted_credentials, binding)
        : {};
      const context = { actor, connection, credentials },
        provider = providerFor(connection.provider);
      for (const encrypted of row.subscriptions) {
        const subscription = z
          .record(z.string(), z.unknown())
          .parse(decrypt(encrypted, bindingFor(context, "webhook")));
        try {
          await provider.unsubscribeWebhooks(context, subscription);
        } catch (error) {
          if (!(
            error instanceof IntegrationError &&
            ["not_found", "unauthorized", "token_revoked"].includes(error.code)
          ))
            throw error;
        }
      }
      try {
        await provider.disconnect(context);
      } catch (error) {
        if (!(
          error instanceof IntegrationError &&
          ["unauthorized", "token_revoked"].includes(error.code)
        ))
          throw error;
      }
      await store.call(actor, "disconnect_finish", { connection_id: connectionId });
      return { result: { disconnected: true } };
    }
    const context = await runtime.load(actor, connectionId),
      provider = providerFor(context.connection.provider);
    if (job.payload.generation !== context.generation)
      throw new PermanentJobError("integration_account_changed");
    if (job.type === "integration_sync") {
      const resource = z.string().min(1).max(200).parse(job.payload.resource);
      const state = z
        .object({
          enabled: z.boolean(),
          encrypted_cursor: z.string().nullable(),
          cursor_revision: z.number().int(),
        })
        .parse(await store.call(actor, "sync_get", { connection_id: connectionId, resource }));
      if (!state.enabled) throw new PermanentJobError("resource_not_selected");
      const cursor = state.encrypted_cursor
        ? z
            .record(z.string(), z.unknown())
            .parse(decrypt(state.encrypted_cursor, bindingFor(context, "webhook")))
        : {};
      if (Number(cursor.zyliad_pages ?? 0) >= 1000)
        throw new PermanentJobError("sync_page_budget_exhausted");
      const admission = z
        .object({ allowed: z.boolean(), retry_after: z.number().optional() })
        .parse(await store.call(actor, "admit", { connection_id: connectionId }));
      if (!admission.allowed)
        throw new IntegrationError("rate_limited", 429, admission.retry_after);
      let page;
      try {
        page = await provider.sync(context, resource, cursor);
      } catch (error) {
        // Resynchronize only the explicitly selected resource when its cursor expires.
        if (!(
          error instanceof IntegrationError &&
          (error.status === 410 || (resource.startsWith("gmail:") && error.code === "not_found"))
        ))
          throw error;
        page = await provider.sync(context, resource, {});
      }
      const providerCursor = { ...cursor };
      delete providerCursor.zyliad_pages;
      const nextCursor = { ...page.cursor };
      delete nextCursor.zyliad_pages;
      if (!page.complete && hashInput(nextCursor) === hashInput(providerCursor))
        throw new PermanentJobError("sync_cursor_not_advancing");
      page.cursor.zyliad_pages = page.complete ? 0 : Number(cursor.zyliad_pages ?? 0) + 1;
      await store.call(actor, "sync_commit", {
        connection_id: connectionId,
        resource,
        generation: context.generation,
        job_id: job.id,
        job_lease: job.lease,
        revision: state.cursor_revision,
        encrypted_cursor: encrypt(page.cursor, bindingFor(context, "webhook")),
        objects: page.objects.map((object) => ({
          external_id: object.externalId,
          deleted: object.deleted ?? false,
          encrypted_metadata: object.deleted
            ? null
            : encrypt(object.data, bindingFor(context, "webhook")),
          remote_updated_at:
            typeof object.data.updated === "string"
              ? object.data.updated
              : typeof object.data.modifiedTime === "string"
                ? object.data.modifiedTime
                : null,
        })),
      });
      if (!page.complete)
        return {
          runAt: new Date(Date.now() + 2000).toISOString(),
          result: { synced: page.objects.length, complete: false },
        };
      return { result: { synced: page.objects.length, complete: true } };
    }
    if (job.type === "integration_webhook") {
      const eventId = z.uuid().parse(job.payload.event_id);
      const value = await store.call(actor, "webhook_load", {
        connection_id: connectionId,
        event_id: eventId,
      });
      if (!value) return { result: { duplicate: true } };
      const event = z.object({ encrypted_payload: z.string() }).parse(value);
      const payload = z
        .union([
          gmailNotificationSchema,
          z.object({ resource: z.string().min(1).max(200) }).strict(),
        ])
        .parse(decrypt(event.encrypted_payload, bindingFor(context, "webhook")));
      if (
        "emailAddress" in payload &&
        payload.emailAddress.toLowerCase() !== context.connection.email?.toLowerCase()
      )
        throw new PermanentJobError("notification_account_mismatch");
      // historyId is a notification target, never the next persisted sync cursor.
      // Starting from the saved cursor also covers delayed/out-of-order notifications.
      await store.call(actor, "sync_enqueue", {
        connection_id: connectionId,
        generation: context.generation,
        resource: payload.resource,
      });
      await store.call(actor, "webhook_finish", { connection_id: connectionId, event_id: eventId });
      return { result: { queued: true } };
    }
    throw new PermanentJobError("unsupported_integration_job");
  } catch (error) {
    if (error instanceof IntegrationError) {
      if (!error.retryable) throw new PermanentJobError(error.code);
    }
    throw error;
  }
}
