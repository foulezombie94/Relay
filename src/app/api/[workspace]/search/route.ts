import { NextRequest, NextResponse } from "next/server";
import { context, databaseError, fail } from "@/lib/api/context";
import { z } from "zod";
const sources = [
  {
    resource: "records",
    columns: "id,object_id,display_name,email,domain,updated_at",
    index: "search",
  },
  {
    resource: "notes",
    columns: "id,record_id,title,content,private,updated_at",
    index: "search_index",
  },
  {
    resource: "tasks",
    columns: "id,record_id,title,description,status,due_date,updated_at",
    index: "search_index",
  },
  {
    resource: "commitments",
    columns: "id,record_id,title,source_quote,status,due_date,updated_at",
    index: "search_index",
  },
  {
    resource: "meetings",
    columns: "id,record_id,title,summary,starts_at,created_at",
    index: "search_index",
  },
] as const;
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    const { workspace } = await params;
    const { client } = await context(workspace);
    const term = z
      .string()
      .trim()
      .min(2)
      .max(200)
      .parse(req.nextUrl.searchParams.get("q"));
    const scope = z
      .enum(["all", "records", "notes", "tasks", "commitments", "meetings"])
      .parse(req.nextUrl.searchParams.get("scope") || "all");
    const groups = await Promise.all(
      sources
        .filter((s) => scope === "all" || scope === s.resource)
        .map(async (source) => {
          let query = client
            .from(source.resource)
            .select(source.columns, { count: "exact" })
            .eq("workspace_id", workspace)
            .textSearch(source.index, term, {
              type: "websearch",
              config: "simple",
            });
          if (source.resource === "records")
            query = query.eq("archived", false);
          const { data, count, error } = await query
            .order(
              source.resource === "meetings" ? "created_at" : "updated_at",
              { ascending: false },
            )
            .limit(25);
          databaseError(error);
          return {
            resource: source.resource,
            count: count ?? 0,
            results: (data ?? []).map((raw) => {
              const row = raw as unknown as Record<string, unknown>;
              return {
                id: row.id,
                object_id: row.object_id,
                record_id: row.record_id,
                title: row.display_name || row.title || "Sans titre",
                excerpt: String(
                  row.content ||
                    row.description ||
                    row.source_quote ||
                    row.summary ||
                    row.email ||
                    row.domain ||
                    "",
                ).slice(0, 500),
                private: row.private === true,
                status: row.status,
                date:
                  row.due_date ||
                  row.starts_at ||
                  row.updated_at ||
                  row.created_at,
              };
            }),
          };
        }),
    );
    const relatedIds = [
      ...new Set(
        groups.flatMap((g) =>
          g.results.flatMap((r) => (r.record_id ? [String(r.record_id)] : [])),
        ),
      ),
    ];
    let related: Record<string, unknown>[] = [];
    if (relatedIds.length) {
      const { data, error } = await client
        .from("records")
        .select("id,object_id,display_name")
        .eq("workspace_id", workspace)
        .eq("archived", false)
        .in("id", relatedIds);
      databaseError(error);
      related = data ?? [];
    }
    return NextResponse.json({ groups, related });
  } catch (e) {
    return fail(e);
  }
}
