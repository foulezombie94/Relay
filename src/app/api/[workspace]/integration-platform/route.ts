import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin, context, requireAdmin } from "@/lib/api/context";
import { manageIntegrations } from "@/lib/integrations/platform/store";
import { sanitizeConnection } from "@/lib/integrations/platform/contracts";
import { marketplaceApps } from "@/lib/integrations/platform/catalog";
import { platformEnabled } from "@/lib/integrations/platform/registry";
import { marketplaceAvailability } from "@/lib/integrations/platform/availability";
import { marketplaceSnapshotSchema } from "@/lib/integrations/platform/marketplace";
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
    const apps = marketplaceAvailability();
    if (!platformEnabled())
      return NextResponse.json(
        { enabled: false, apps, connections: [], policies: [], audit: [], commands: [] },
        { headers: { "Cache-Control": "no-store" } },
      );
    const [rows, policies, audit, commands] = await Promise.all([
      manageIntegrations(client, workspace, "list"),
      manageIntegrations(client, workspace, "policies"),
      manageIntegrations(client, workspace, "audit"),
      manageIntegrations(client, workspace, "commands"),
    ]);
    return NextResponse.json(
      marketplaceSnapshotSchema.parse({
        enabled: true,
        connections: z.array(z.record(z.string(), z.unknown())).parse(rows).map(sanitizeConnection),
        policies,
        audit,
        commands,
        apps,
      }),
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
