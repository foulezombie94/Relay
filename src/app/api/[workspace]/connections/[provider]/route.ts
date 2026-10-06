import { NextRequest, NextResponse } from "next/server";
import {
  context,
  checkOrigin,
  databaseError,
  fail,
  ApiError,
} from "@/lib/api/context";
import { provider } from "@/lib/integrations/oauth";
import { synchronize } from "@/lib/integrations/sync";
import { z } from "zod";
type P = { params: Promise<{ workspace: string; provider: string }> };
export const maxDuration = 120;
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
export async function PATCH(req: NextRequest, { params }: P) {
  try {
    checkOrigin(req);
    const { workspace, provider: p } = await params;
    const name = provider(p);
    const { client } = await context(workspace, true);
    const { enabled } = z
      .object({ enabled: z.boolean() })
      .parse(await req.json());
    if (enabled && !process.env.JOBS_SECRET)
      throw new ApiError(
        "Le service de synchronisation automatique doit être configuré par votre administrateur.",
        503,
      );
    const { error } = await client.rpc("connector_sync", {
      w: workspace,
      p: name,
      operation: "configure",
      payload: { enabled },
    });
    databaseError(error);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
