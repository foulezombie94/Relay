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
import { generateApiKey } from "@/lib/api/public-api";
import { apiScopes } from "@/lib/domain/public-api";

type Params = { params: Promise<{ workspace: string }> };
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { workspace } = await params;
    const { client, role } = await context(workspace);
    requireAdmin(role);
    const { data, error } = await client
      .from("api_keys")
      .select("id,name,prefix,scopes,created_by,created_at,expires_at,revoked_at,last_used_at")
      .eq("workspace_id", workspace)
      .order("created_at", { ascending: false })
      .limit(100);
    databaseError(error);
    return NextResponse.json({ data: data ?? [] }, { headers: noStore });
  } catch (error) {
    return fail(error);
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(apiScopes)).min(1).max(apiScopes.length),
  expires_in_days: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]).default(365),
});

/** Creates a key; the secret is returned once and only its SHA-256 digest is stored. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    checkOrigin(request);
    const { workspace } = await params;
    const { client, role } = await context(workspace, true);
    requireAdmin(role);
    const body = createSchema.parse(await jsonBody(request));
    const key = generateApiKey();
    const expires = body.expires_in_days
      ? new Date(Date.now() + body.expires_in_days * 86400000).toISOString()
      : null;
    const { data, error } = await client.rpc("api_key_create", {
      w: workspace,
      label: body.name,
      key_prefix: key.prefix,
      key_hash: key.hash,
      permissions: [...new Set(body.scopes)],
      expires,
    });
    databaseError(error);
    if (!z.uuid().safeParse(data).success) throw new ApiError("Création non confirmée.", 500);
    return NextResponse.json(
      { data: { id: data, prefix: key.prefix, expires_at: expires }, secret: key.key },
      { status: 201, headers: noStore },
    );
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
    const { error } = await client.rpc("api_key_revoke", { w: workspace, key_id: id });
    databaseError(error);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return fail(error);
  }
}
