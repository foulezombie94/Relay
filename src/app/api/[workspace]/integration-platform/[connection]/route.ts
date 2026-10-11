import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin, context, ApiError } from "@/lib/api/context";
import {
  integrationServices,
  integrationFailure,
  integrationBody,
} from "@/lib/integrations/platform/api";
import { userActor } from "@/lib/integrations/platform/runtime";
import { providerFor } from "@/lib/integrations/platform/registry";
import { manageIntegrations } from "@/lib/integrations/platform/store";
import { decrypt, encrypt } from "@/lib/integrations/platform/vault";
import { bindingFor } from "@/lib/integrations/platform/runtime";
import { appOrigin } from "@/lib/integrations/platform/oauth-state";
import { randomUUID } from "node:crypto";
import { IntegrationError } from "@/lib/integrations/platform/errors";
type Params = { params: Promise<{ workspace: string; connection: string }> };
const resourceSchema = z.string().regex(/^(calendar:.{1,180}|gmail:inbox|drive:shared)$/);
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { workspace, connection } = await params,
      { user } = await context(workspace, true),
      { store, runtime } = integrationServices(),
      actor = userActor(workspace, user.id);
    const loaded = await runtime.load(actor, z.uuid().parse(connection));
    if (request.nextUrl.searchParams.has("resource")) {
      const resource = resourceSchema.parse(request.nextUrl.searchParams.get("resource"));
      assertResourceEnabled(loaded.connection.enabled_integrations, resource);
      const state = z
        .object({
          enabled: z.boolean().default(false),
          last_sync_at: z.string().nullable().optional(),
        })
        .parse(await store.call(actor, "sync_get", { connection_id: connection, resource }));
      return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
    }
    const commandId = z.uuid().parse(request.nextUrl.searchParams.get("command"));
    const row = z
      .object({
        encrypted_input: z.string(),
        risk: z.number(),
        status: z.string(),
        expires_at: z.string(),
      })
      .parse(
        await store.call(actor, "command_load", {
          connection_id: connection,
          command_id: commandId,
        }),
      );
    const proposal = z
      .object({
        action: z.string(),
        input: z.unknown(),
        source: z.enum(["user", "agent", "automation"]),
      })
      .parse(decrypt(row.encrypted_input, bindingFor(loaded, "command")));
    const definition = providerFor(loaded.connection.provider)
      .getCapabilities()
      .find((action) => action.name === proposal.action);
    if (!definition) throw new ApiError("Cette action n’est plus disponible.", 409);
    return NextResponse.json(
      {
        action: proposal.action,
        input: definition.input.parse(proposal.input),
        source: proposal.source,
        risk: row.risk,
        status: row.status,
        expiresAt: row.expires_at,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return integrationFailure(error);
  }
}
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    checkOrigin(request);
    const { workspace, connection } = await params,
      { user } = await context(workspace, true);
    z.object({ confirm: z.literal(true) })
      .strict()
      .parse(await integrationBody(request));
    const { store } = integrationServices();
    return NextResponse.json(
      {
        status: "revoked",
        data: await store.call(userActor(workspace, user.id), "disconnect_start", {
          connection_id: z.uuid().parse(connection),
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return integrationFailure(error);
  }
}
export async function POST(request: NextRequest, { params }: Params) {
  try {
    checkOrigin(request);
    const { workspace, connection } = await params,
      { user, client } = await context(workspace, true),
      { store, runtime } = integrationServices(),
      actor = userActor(workspace, user.id);
    const input = z
      .discriminatedUnion("operation", [
        z.object({ operation: z.literal("health") }).strict(),
        z.object({ operation: z.literal("sync"), resource: resourceSchema }).strict(),
        z
          .object({
            operation: z.literal("configure_sync"),
            resource: resourceSchema,
            enabled: z.boolean(),
          })
          .strict(),
        z.object({ operation: z.literal("subscribe"), resource: resourceSchema }).strict(),
        z
          .object({
            operation: z.literal("execute"),
            action: z.string().regex(/^[a-z0-9_.]{1,100}$/),
            input: z.unknown(),
            correlationId: z.uuid(),
          })
          .strict(),
        z.object({ operation: z.literal("approve"), commandId: z.uuid() }).strict(),
        z.object({ operation: z.literal("reject"), commandId: z.uuid() }).strict(),
      ])
      .parse(await integrationBody(request));
    const connectionId = z.uuid().parse(connection);
    if (input.operation === "execute")
      return NextResponse.json(
        await runtime.execute(
          { ...actor, correlationId: input.correlationId },
          connectionId,
          input.action,
          input.input,
        ),
        { headers: { "Cache-Control": "no-store" } },
      );
    if (input.operation === "approve" || input.operation === "reject") {
      const review = z.object({ connection_id: z.uuid() }).parse(
        await store.call(actor, "command_load", {
          connection_id: connectionId,
          command_id: input.commandId,
        }),
      );
      if (review.connection_id !== connectionId)
        throw new ApiError("Cette action est inaccessible.", 403);
      await manageIntegrations(client, workspace, input.operation, { command_id: input.commandId });
      const result =
        input.operation === "approve"
          ? await runtime.executeApproved(actor, connectionId, input.commandId)
          : { status: "cancelled" };
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    const loaded = await runtime.load(actor, connectionId),
      provider = providerFor(loaded.connection.provider);
    if (input.operation === "health") {
      await provider.healthCheck(loaded);
      await store.call(actor, "status", {
        connection_id: connectionId,
        generation: loaded.generation,
        status: "connected",
        error_code: null,
      });
      return NextResponse.json({ healthy: true }, { headers: { "Cache-Control": "no-store" } });
    }
    assertResourceEnabled(loaded.connection.enabled_integrations, input.resource);
    if (input.operation === "configure_sync")
      return NextResponse.json(
        {
          data: await store.call(actor, "sync_configure", {
            connection_id: connectionId,
            generation: loaded.generation,
            resource: input.resource,
            enabled: input.enabled,
          }),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (input.operation === "sync")
      return NextResponse.json(
        {
          data: await store.call(actor, "sync_enqueue", {
            connection_id: connectionId,
            generation: loaded.generation,
            resource: input.resource,
          }),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    const subscriptionId = randomUUID(),
      callback = new URL(`/api/integration-webhooks/${subscriptionId}`, appOrigin());
    const state = z.record(z.string(), z.unknown()).parse(
      await store.call(actor, "sync_get", {
        connection_id: connectionId,
        resource: input.resource,
      }),
    );
    if (state.enabled !== true)
      throw new ApiError("Choisissez cette ressource avant d’activer ses notifications.", 400);
    const existing = z
      .array(
        z.object({
          resource_type: z.string(),
          encrypted_subscription: z.string(),
          expires_at: z.string().nullable(),
        }),
      )
      .parse(await store.call(actor, "subscriptions", { connection_id: connectionId }))
      .find((row) => row.resource_type === input.resource);
    if (existing && (!existing.expires_at || Date.parse(existing.expires_at) > Date.now() + 60_000))
      return NextResponse.json({ subscribed: true }, { headers: { "Cache-Control": "no-store" } });
    if (existing) {
      const old = z
        .record(z.string(), z.unknown())
        .parse(decrypt(existing.encrypted_subscription, bindingFor(loaded, "webhook")));
      try {
        await provider.unsubscribeWebhooks(loaded, old);
      } catch (error) {
        if (!(
          error instanceof IntegrationError &&
          ["not_found", "unauthorized", "token_revoked"].includes(error.code)
        ))
          throw error;
      }
    }
    const cursor = state.encrypted_cursor
      ? z
          .record(z.string(), z.unknown())
          .parse(decrypt(String(state.encrypted_cursor), bindingFor(loaded, "webhook")))
      : {};
    const subscription = await provider.subscribeWebhooks(
      { ...loaded, subscription: { resource: input.resource, ...cursor } },
      callback,
    );
    try {
      await store.call(actor, "subscription_save", {
        connection_id: connectionId,
        generation: loaded.generation,
        resource: input.resource,
        subscription_id: subscriptionId,
        encrypted_subscription: encrypt(subscription, bindingFor(loaded, "webhook")),
        expires_at:
          typeof subscription.expiration === "string"
            ? new Date(Number(subscription.expiration)).toISOString()
            : null,
      });
    } catch (error) {
      await provider.unsubscribeWebhooks(loaded, subscription).catch(() => undefined);
      throw error;
    }
    // Google's initial notification may precede the watch response/registration.
    // An incremental catch-up after registration closes that delivery window.
    await store.call(actor, "sync_enqueue", {
      connection_id: connectionId,
      generation: loaded.generation,
      resource: input.resource,
    });
    return NextResponse.json({ subscribed: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return integrationFailure(error);
  }
}

function assertResourceEnabled(integrations: readonly string[], resource: string) {
  const integration = resource.startsWith("calendar:")
    ? "google-calendar"
    : resource === "gmail:inbox"
      ? "gmail"
      : "google-drive";
  if (!integrations.includes(integration))
    throw new ApiError("Activez cette fonctionnalité avant de synchroniser ses données.", 403);
}
