import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiError,
  checkOrigin,
  context,
  databaseError,
  fail,
  jsonBody,
  requireAdmin,
} from "@/lib/api/context";
import { createWebhookBody, webhookEvents } from "@/lib/domain/public-api";
import {
  assertWebhookUrl,
  generateWebhookSecret,
  sealWebhookSecret,
} from "@/lib/integrations/webhooks";

type Params = { params: Promise<{ workspace: string }> };
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { workspace } = await params;
    const { client, role } = await context(workspace);
    requireAdmin(role);
    const endpoint = request.nextUrl.searchParams.get("endpoint");
    const [endpoints, deliveries] = await Promise.all([
      client
        .from("webhook_endpoints")
        .select(
          "id,url,description,events,object_ids,enabled,consecutive_failures,disabled_reason,created_at,updated_at,last_delivery_at",
        )
        .eq("workspace_id", workspace)
        .order("created_at"),
      client.rpc("webhook_deliveries_list", {
        w: workspace,
        endpoint: endpoint ? z.uuid().parse(endpoint) : null,
        page_size: 50,
      }),
    ]);
    databaseError(endpoints.error);
    databaseError(deliveries.error);
    return NextResponse.json(
      { data: endpoints.data ?? [], deliveries: deliveries.data ?? [] },
      { headers: noStore },
    );
  } catch (error) {
    return fail(error);
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), webhook: createWebhookBody }),
  z.object({ action: z.literal("ping"), id: z.uuid() }),
  z.object({ action: z.literal("rotate"), id: z.uuid() }),
]);

export async function POST(request: NextRequest, { params }: Params) {
  try {
    checkOrigin(request);
    const { workspace } = await params;
    const { client, role } = await context(workspace, true);
    requireAdmin(role);
    const body = actionSchema.parse(await jsonBody(request));
    if (body.action === "ping") {
      const { data, error } = await client.rpc("webhook_endpoint_ping", {
        w: workspace,
        endpoint: body.id,
      });
      databaseError(error);
      return NextResponse.json({ event_id: data }, { headers: noStore });
    }
    const secret = generateWebhookSecret();
    if (body.action === "rotate") {
      const { error } = await client.rpc("webhook_endpoint_rotate", {
        w: workspace,
        endpoint: body.id,
        sealed_secret: sealWebhookSecret(secret),
      });
      databaseError(error);
      return NextResponse.json({ secret }, { headers: noStore });
    }
    try {
      assertWebhookUrl(body.webhook.url);
    } catch {
      throw new ApiError(
        "Utilisez une URL HTTPS publique (pas d’adresse IP ni de réseau interne).",
      );
    }
    const { data, error } = await client.rpc("webhook_endpoint_create", {
      w: workspace,
      target: body.webhook.url,
      label: body.webhook.description ?? "",
      event_types: body.webhook.events,
      objects: body.webhook.object_ids?.length ? body.webhook.object_ids : null,
      sealed_secret: sealWebhookSecret(secret),
    });
    databaseError(error);
    if (!z.uuid().safeParse(data).success) throw new ApiError("Création non confirmée.", 500);
    return NextResponse.json({ data: { id: data }, secret }, { status: 201, headers: noStore });
  } catch (error) {
    return fail(error);
  }
}

const updateSchema = z.object({
  id: z.uuid(),
  values: z
    .object({
      url: z.url().max(2000).optional(),
      description: z.string().max(300).optional(),
      events: z.array(z.enum(webhookEvents)).min(1).optional(),
      object_ids: z.array(z.uuid()).max(50).nullable().optional(),
      enabled: z.boolean().optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0, "Aucune modification."),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    checkOrigin(request);
    const { workspace } = await params;
    const { client, role } = await context(workspace, true);
    requireAdmin(role);
    const { id, values } = updateSchema.parse(await jsonBody(request));
    if (values.url)
      try {
        assertWebhookUrl(values.url);
      } catch {
        throw new ApiError("Utilisez une URL HTTPS publique.");
      }
    const { data, error } = await client
      .from("webhook_endpoints")
      .update({ ...values, ...(values.object_ids?.length === 0 ? { object_ids: null } : {}) })
      .eq("workspace_id", workspace)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    databaseError(error);
    if (!data) throw new ApiError("Webhook introuvable.", 404);
    return NextResponse.json({ data }, { headers: noStore });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    checkOrigin(request);
    const { workspace } = await params;
    const { client, role } = await context(workspace, true);
    requireAdmin(role);
    const id = z.uuid().parse(request.nextUrl.searchParams.get("id"));
    const { data, error } = await client
      .from("webhook_endpoints")
      .delete()
      .eq("workspace_id", workspace)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    databaseError(error);
    if (!data) throw new ApiError("Webhook introuvable.", 404);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return fail(error);
  }
}
