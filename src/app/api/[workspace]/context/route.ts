import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, fail, ApiError, databaseError } from "@/lib/api/context";
import { recordColumns } from "@/lib/api/record-query";
import type { Row } from "@/lib/domain/types";
type Params = { params: Promise<{ workspace: string }> };
const tables = [
  "notes",
  "tasks",
  "commitments",
  "activities",
  "meetings",
  "documents",
  "conflicts",
] as const;
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { workspace } = await params;
    const { client } = await context(workspace);
    const id = z.uuid().parse(request.nextUrl.searchParams.get("record_id"));
    const { data: record, error } = await client
      .from("records")
      .select(recordColumns)
      .eq("workspace_id", workspace)
      .eq("id", id)
      .single();
    databaseError(error);
    if (!record) throw new ApiError("Fiche inaccessible.", 404);
    const results = await Promise.all(
      tables.map(async (table) => {
        const columns: Record<string, string> = {
          notes: "id,workspace_id,title,content,private,author_id,created_at",
          meetings: "id,workspace_id,title,summary,starts_at,created_at",
          documents: "id,workspace_id,name,mime,size,created_at",
        };
        const { data, error, count } = await client
          .from(table)
          .select(columns[table] ?? "*", { count: "exact" })
          .eq("workspace_id", workspace)
          .eq("record_id", id)
          .order("created_at", { ascending: false })
          .order("id")
          .limit(100);
        databaseError(error);
        return {
          table,
          rows: (data ?? []) as unknown as Row[],
          count: count ?? 0,
        };
      }),
    );
    const {
      data: relations,
      error: re,
      count: relationCount,
    } = await client
      .from("record_relations")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspace)
      .or("source_id.eq." + id + ",target_id.eq." + id)
      .order("id")
      .limit(100);
    databaseError(re);
    const relatedIds = [
      ...new Set(
        (relations ?? []).map((r) =>
          r.source_id === id ? r.target_id : r.source_id,
        ),
      ),
    ];
    const related = relatedIds.length
      ? await client
          .from("records")
          .select(recordColumns)
          .eq("workspace_id", workspace)
          .in("id", relatedIds)
      : { data: [], error: null };
    databaseError(related.error);
    const timeline = results
      .flatMap((r) => r.rows.map((row) => ({ ...row, resource: r.table })))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return NextResponse.json({
      record,
      relations: relations ?? [],
      relation_count: relationCount ?? 0,
      related: related.data ?? [],
      timeline,
      counts: Object.fromEntries(results.map((r) => [r.table, r.count])),
      truncated:
        results.some((r) => r.count > 100) || (relationCount ?? 0) > 100,
    });
  } catch (e) {
    return fail(e);
  }
}
