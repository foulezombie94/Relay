import { NextRequest, NextResponse } from "next/server";
import { context, checkOrigin, databaseError, fail, ApiError } from "@/lib/api/context";
import { provider } from "@/lib/integrations/oauth";
import { synchronize } from "@/lib/integrations/sync";
import { z } from "zod";
import { enqueueJob, workerReady } from "@/lib/jobs/client";
import { backgroundJobsEnabled } from "@/lib/jobs/flags";
import { adminDb } from "@/lib/supabase/admin";
import { services } from "@/lib/integrations/services";
type P = { params: Promise<{ workspace: string; provider: string }> };
export const maxDuration = 30;
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
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
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
    if (backgroundJobsEnabled()) {
      const kind = services[name].kind === "email" ? "email_sync" : "calendar_sync";
      if (!(await workerReady(adminDb(), kind)))
        throw new ApiError("Le service de synchronisation est temporairement indisponible.", 503);
      const job = await enqueueJob(client, workspace, kind, { provider: name });
      return NextResponse.json(
        { queued: true, job },
        { status: 202, headers: { "Cache-Control": "no-store" } },
      );
    }
    const result = await synchronize(client, workspace, user.id, name);
    return NextResponse.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
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
    const { enabled } = z.object({ enabled: z.boolean() }).parse(await req.json());
    if (
      enabled &&
      (!backgroundJobsEnabled() ||
        !(await workerReady(
          adminDb(),
          services[name].kind === "email" ? "email_sync" : "calendar_sync",
        )))
    )
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
