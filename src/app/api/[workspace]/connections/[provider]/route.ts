import { NextRequest, NextResponse } from "next/server";
import { context, checkOrigin, databaseError, fail } from "@/lib/api/context";
import { provider } from "@/lib/integrations/oauth";
import { synchronize } from "@/lib/integrations/sync";
type P = { params: Promise<{ workspace: string; provider: string }> };
export async function DELETE(req: NextRequest, { params }: P) {
  try {
    checkOrigin(req);
    const { workspace, provider: p } = await params;
    const name = provider(p);
    const { client } = await context(workspace, true);
    const { error } = await client.rpc("integration_disconnect", {
      w: workspace,
      p: name,
    });
    databaseError(error);
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: NextRequest, { params }: P) {
  try {
    checkOrigin(req);
    const { workspace, provider: p } = await params;
    const name = provider(p);
    const { client, user } = await context(workspace, true);
    const result = await synchronize(client, workspace, user.id, name);
    return NextResponse.json(
      { data: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
