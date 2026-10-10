import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { adminDb } from "@/lib/supabase/admin";
import { databaseError } from "@/lib/api/context";
import { rawBody } from "@/lib/integrations/platform/webhook-security";
import { platformEnabled, providerFor } from "@/lib/integrations/platform/registry";
import { integrationFailure } from "@/lib/integrations/platform/api";
import { sanitizeConnection } from "@/lib/integrations/platform/contracts";
import { openCredentials, decrypt, encrypt } from "@/lib/integrations/platform/vault";
import { bindingFor } from "@/lib/integrations/platform/runtime";
import { IntegrationStore } from "@/lib/integrations/platform/store";
import { IntegrationError } from "@/lib/integrations/platform/errors";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ subscription: string }> },
) {
  try {
    if (!platformEnabled()) throw new IntegrationError("unsupported", 503);
    const subscriptionId = z.uuid().parse((await params).subscription),
      admin = adminDb();
    const { data, error } = await admin.rpc("integration_webhook_context", {
      subscription_id: subscriptionId,
    });
    databaseError(error);
    if (!data) throw new IntegrationError("not_found", 404);
    const row = z
        .object({
          connection: z.record(z.string(), z.unknown()),
          generation: z.number().int(),
          encrypted_credentials: z.string(),
          encrypted_subscription: z.string(),
        })
        .parse(data),
      connection = sanitizeConnection(row.connection);
    const actor = {
      workspaceId: connection.workspace_id,
      userId: connection.connected_by_user_id,
      source: "user" as const,
      correlationId: randomUUID(),
    };
    const context = {
      actor,
      connection,
      credentials: openCredentials(row.encrypted_credentials, {
        workspaceId: actor.workspaceId,
        connectionId: connection.id,
        provider: connection.provider,
        externalAccountId: connection.external_account_id,
        purpose: "credentials",
      }),
    };
    const subscription = z
      .record(z.string(), z.unknown())
      .parse(decrypt(row.encrypted_subscription, bindingFor(context, "webhook")));
    const verified = await providerFor(connection.provider).handleWebhook(
      await rawBody(request),
      request.headers,
      { ...context, subscription },
    );
    await new IntegrationStore(admin).call(actor, "webhook_enqueue", {
      connection_id: connection.id,
      generation: row.generation,
      event_id: verified.eventId,
      event_type: verified.eventType,
      occurred_at: verified.occurredAt,
      encrypted_payload: encrypt(verified.payload, bindingFor(context, "webhook")),
    });
    return new NextResponse(null, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return integrationFailure(error);
  }
}
