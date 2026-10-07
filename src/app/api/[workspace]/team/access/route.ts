import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, requireAdmin, checkOrigin, ApiError, databaseError, fail } from "@/lib/api/context";
type Params = { params: Promise<{ workspace: string }> };
const json = (data: unknown) => NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { workspace } = await params;
    const { client, role } = await context(workspace); requireAdmin(role);
    const p = req.nextUrl.searchParams;
    if (p.get("mode") === "records") {
      const page = z.coerce.number().int().min(0).max(10000).parse(p.get("page") ?? "0");
      const search = z.string().trim().max(120).parse(p.get("q") ?? "");
      let query = client.from("records").select("id,display_name,object_id,archived", { count: "exact" }).eq("workspace_id", workspace).eq("archived", false);
      if (p.get("object")) query = query.eq("object_id", z.uuid().parse(p.get("object")));
      if (search) query = query.ilike("display_name", "%" + search.replace(/[\\%_]/g, "\\$&") + "%");
      const { data, count, error } = await query.order("display_name").order("id").range(page * 25, page * 25 + 24); databaseError(error);
      return json({ data, count });
    }
    const { data, error } = await client.rpc("team_reader_access_get", { w: workspace, u: z.uuid().parse(p.get("user")) }); databaseError(error); return json(data);
  } catch (error) { return fail(error); }
}
export async function POST(req: NextRequest, { params }: Params) {
  try {
    checkOrigin(req); const { workspace } = await params;
    const { client, role } = await context(workspace, true); requireAdmin(role);
    const reader = req.body?.getReader(); if (!reader) throw new ApiError("Requête invalide.");
    const chunks: Uint8Array[] = []; let bytes = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength;
      if (bytes > 50000) { await reader.cancel(); throw new ApiError("Sélection trop volumineuse.", 413); } chunks.push(part.value);
    } } finally { reader.releaseLock(); }
    let body: unknown; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new ApiError("Requête invalide."); }
    const input = z.object({ user: z.uuid(), version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), scope: z.enum(["all", "selected"]), records: z.array(z.uuid()).max(1000) }).strict().parse(body);
    const { data, error } = await client.rpc("team_reader_access_set", { w: workspace, u: input.user, expected_version: input.version, scope: input.scope, record_ids: input.records });
    if (error?.code === "40001") throw new ApiError("Les droits ont changé. Fermez puis rouvrez cette fenêtre avant de recommencer.", 409);
    if (error?.code === "53300") throw new ApiError("Trop de changements. Réessayez dans une minute.", 429);
    if (error?.code === "55P03") throw new ApiError("Une modification est en cours. Réessayez.", 409);
    databaseError(error); return json(data);
  } catch (error) { return fail(error); }
}
