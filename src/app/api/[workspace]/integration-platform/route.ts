import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin, context, requireAdmin } from "@/lib/api/context";
import { manageIntegrations } from "@/lib/integrations/platform/store";
import { sanitizeConnection } from "@/lib/integrations/platform/contracts";
import { marketplaceApps } from "@/lib/integrations/platform/catalog";
import {
  providerConfigured,
  platformEnabled,
  scopesFor,
} from "@/lib/integrations/platform/registry";
import {
  integrationFailure,
  integrationBody,
  integrationServices,
} from "@/lib/integrations/platform/api";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    const { workspace } = await params,
      { client } = await context(workspace);
    if (!platformEnabled())
      return NextResponse.json({ enabled: false }, { headers: { "Cache-Control": "no-store" } });
    const [rows, policies, audit, commands] = await Promise.all([
      manageIntegrations(client, workspace, "list"),
      manageIntegrations(client, workspace, "policies"),
      manageIntegrations(client, workspace, "audit"),
      manageIntegrations(client, workspace, "commands"),
    ]);
    return NextResponse.json(
      {
        enabled: true,
        connections: z.array(z.record(z.string(), z.unknown())).parse(rows).map(sanitizeConnection),
        policies,
        audit,
        commands,
        apps: marketplaceApps.map((app) => {
          let scopes: string[] = [];
          try {
            scopes = scopesFor(app.id);
          } catch {}
          return { ...app, configured: providerConfigured(app.provider), scopes };
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return integrationFailure(error);
  }
}
const policySchema = z
  .object({
    integration: z.enum(
      marketplaceApps.map((app) => app.id) as [
        (typeof marketplaceApps)[number]["id"],
        ...(typeof marketplaceApps)[number]["id"][],
      ],
    ),
    read: z.boolean(),
    create: z.boolean(),
    update: z.boolean(),
    send: z.boolean(),
    delete: z.boolean(),
  })
  .strict();
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    checkOrigin(request);
    const { workspace } = await params,
      { client, role } = await context(workspace, true);
    requireAdmin(role);
    integrationServices();
    const policy = policySchema.parse(await integrationBody(request));
    return NextResponse.json(
      { data: await manageIntegrations(client, workspace, "policy_save", policy) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return integrationFailure(error);
  }
}
