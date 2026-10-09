import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, requireAdmin, checkOrigin, databaseError, fail } from "@/lib/api/context";
import { digest } from "@/lib/integrations/crypto";
const headers = { "Cache-Control": "private, no-store" };
type P = { params: Promise<{ workspace: string }> };
export async function GET(_: NextRequest, { params }: P) {
  try {
    const { workspace } = await params;
    const { client, role } = await context(workspace);
    requireAdmin(role);
    const { data, error } = await client
      .from("zapier_keys")
      .select("id,name,suffix,scopes,expires_at,revoked_at,last_used_at,created_at")
      .eq("workspace_id", workspace)
      .order("created_at", { ascending: false })
      .limit(50);
    databaseError(error);
    return NextResponse.json({ data, configured: !!process.env.SUPABASE_SECRET_KEY }, { headers });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: NextRequest, { params }: P) {
  try {
    checkOrigin(req);
    const { workspace } = await params;
    const { client, role } = await context(workspace, true);
    requireAdmin(role);
    const body = z
      .object({
        name: z.string().trim().min(1).max(100),
        allow_write: z.boolean().default(false),
      })
      .strict()
      .parse(await req.json());
    const key = "relay_zap_" + randomBytes(32).toString("base64url");
    const permissions = [
      "records:read",
      "tasks:read",
      ...(body.allow_write ? ["records:write", "tasks:write"] : []),
    ];
    const { data, error } = await client.rpc("zapier_key_create", {
      w: workspace,
      label: body.name,
      suffix: key.slice(-4),
      key_hash: digest(key),
      permissions,
    });
    databaseError(error);
    return NextResponse.json(
      { data: { id: data, key, scopes: permissions } },
      { status: 201, headers },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function DELETE(req: NextRequest, { params }: P) {
  try {
    checkOrigin(req);
    const { workspace } = await params;
    const { client, role } = await context(workspace, true);
    requireAdmin(role);
    const id = z.uuid().parse(req.nextUrl.searchParams.get("id"));
    const { error } = await client.rpc("zapier_key_revoke", {
      w: workspace,
      key_id: id,
    });
    databaseError(error);
    return NextResponse.json({ ok: true }, { headers });
  } catch (e) {
    return fail(e);
  }
}
