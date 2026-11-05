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

type Params = { params: Promise<{ workspace: string }> };
const trashColumns =
  "id,object_id,display_name,email,domain,stage,amount,currency,deleted_at,deleted_by,updated_at,version";

/** Records deleted from the CRM (archived, not merged), newest first. */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { workspace } = await params;
    const { client } = await context(workspace);
    const p = request.nextUrl.searchParams;
    const page = Math.max(0, Math.floor(Number(p.get("page") ?? 0) || 0));
    const size = Math.min(100, Math.max(1, Math.floor(Number(p.get("size") ?? 50) || 50)));
    let query = client
      .from("records")
      .select(trashColumns, { count: "exact" })
      .eq("workspace_id", workspace)
      .eq("archived", true)
      .is("merged_into", null);
    if (p.get("object_id")) query = query.eq("object_id", z.uuid().parse(p.get("object_id")));
    const search = z
      .string()
      .max(200)
      .parse(p.get("q") ?? "")
      .trim();
    if (search) query = query.textSearch("search", search, { type: "websearch", config: "simple" });
    const { data, error, count } = await query
      .order("deleted_at", { ascending: false, nullsFirst: false })
      .order("id")
      .range(page * size, (page + 1) * size - 1);
    databaseError(error);
    return NextResponse.json(
      { data: data ?? [], count, page, size, retention_days: 30 },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return fail(error);
  }
}

const actionSchema = z.object({
  action: z.enum(["restore", "purge"]),
  ids: z.array(z.uuid()).min(1).max(100),
  /** Exact confirmation for an irreversible purge. */
  confirm: z.string().optional(),
});

export async function POST(request: NextRequest, { params }: Params) {
  try {
    checkOrigin(request);
    const { workspace } = await params;
    const { client, role } = await context(workspace, true);
    const body = actionSchema.parse(await jsonBody(request));
    const ids = [...new Set(body.ids)];
    if (body.action === "restore") {
      const { data, error } = await client.rpc("restore_records", { w: workspace, ids });
      databaseError(error);
      return NextResponse.json({ restored: Number(data) || 0 });
    }
    requireAdmin(role);
    if (body.confirm !== "SUPPRIMER")
      throw new ApiError("Saisissez SUPPRIMER pour confirmer la suppression définitive.");
    const { data, error } = await client.rpc("purge_records", { w: workspace, ids });
    databaseError(error);
    const result = z.object({ purged: z.number(), kept: z.number() }).parse(data);
    return NextResponse.json(result);
  } catch (error) {
    return fail(error);
  }
}
