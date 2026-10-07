import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, checkOrigin, databaseError, ApiError, fail } from "@/lib/api/context";
import { workerReady } from "@/lib/jobs/client";
import { adminDb } from "@/lib/supabase/admin";
type Params = { params: Promise<{ workspace: string }> };
const json = (data: unknown) => NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { workspace } = await params, { client, role } = await context(workspace);
    if (role === "viewer") throw new ApiError("L’historique des automatisations est réservé aux membres de l’équipe.", 403);
    const p = req.nextUrl.searchParams, page = z.coerce.number().int().min(0).max(10000).parse(p.get("page") ?? 0);
    let query = client.from("workflow_executions").select("*", { count: "exact" }).eq("workspace_id", workspace);
    if (p.get("workflow")) query = query.eq("workflow_id", z.uuid().parse(p.get("workflow")));
    if (p.get("status")) query = query.eq("status", z.enum(["queued", "running", "waiting", "paused", "completed", "failed", "cancelled", "skipped"]).parse(p.get("status")));
    if (p.get("id")) query = query.eq("id", z.uuid().parse(p.get("id")));
    const { data, count, error } = await query.order("created_at", { ascending: false }).order("id").range(page * 25, page * 25 + 24);
    databaseError(error);
    const ids = [...new Set((data ?? []).map(row => row.record_id))];
    const related = ids.length ? await client.from("records").select("id,object_id").eq("workspace_id", workspace).in("id", ids) : { data: [], error: null };
    databaseError(related.error);
    return json({ data: (data ?? []).map(row => ({ ...row, record_object_id: related.data?.find(record => record.id === row.record_id)?.object_id })), count });
  } catch (error) { return fail(error); }
}
export async function POST(req: NextRequest, { params }: Params) {
  try {
    checkOrigin(req); const { workspace } = await params, { client } = await context(workspace, true);
    const reader = req.body?.getReader(); if (!reader) throw new ApiError("Requête invalide.");
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength;
      if (size > 2000) { await reader.cancel(); throw new ApiError("Requête trop volumineuse.", 413); } chunks.push(part.value);
    } } finally { reader.releaseLock(); }
    let body: unknown; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new ApiError("Requête invalide."); }
    const input = z.object({ id: z.uuid(), version: z.number().int().positive(), action: z.enum(["publish", "pause", "resume", "retry", "cancel"]), execution: z.uuid().optional() }).strict().parse(body);
    if (["publish", "resume", "retry"].includes(input.action) && !(await workerReady(adminDb(), "workflow_run"))) throw new ApiError("Le service d’automatisation est indisponible. Vos brouillons restent enregistrés ; réessayez dans quelques instants.", 503);
    const { data, error } = await client.rpc("workflow_control", { w: workspace, wf: input.id, operation: input.action, expected_version: input.version, execution: input.execution ?? null });
    if (error?.code === "40001") throw new ApiError("Le workflow a changé. Rechargez-le avant de recommencer.", 409);
    if (error?.code === "55P03") throw new ApiError("Une exécution est en cours. Réessayez dans quelques instants.", 409);
    if (error?.code === "53300") throw new ApiError("La limite de workflows actifs est atteinte. Mettez un workflow en pause.", 429);
    if (error?.code === "22023") throw new ApiError("Vérifiez les actions, les responsables et les listes. Si un ancien compte d’exécution a perdu son accès, republiez le workflow.");
    databaseError(error); return json({ data });
  } catch (error) { return fail(error); }
}
