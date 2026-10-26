import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { databaseError } from "./context";
import type { RecordLinks, RecordLink, LinkedRecord } from "@/lib/domain/record-links";

export async function readRecordLinks(
  client: SupabaseClient,
  workspace: string,
  ids: string[],
  targetObject: string,
): Promise<RecordLinks> {
  const sources = await client
    .from("records")
    .select("id")
    .eq("workspace_id", workspace)
    .in("id", ids)
    .eq("archived", false)
    .is("merged_into", null);
  databaseError(sources.error);
  const allowed = new Set((sources.data ?? []).map((row) => row.id as string));
  if (!allowed.size) return { links: [], records: [], partial: false };
  const list = [...allowed].join(",");
  const result = await client
    .from("record_relations")
    .select("id,source_id,target_id,label")
    .eq("workspace_id", workspace)
    .or(`source_id.in.(${list}),target_id.in.(${list})`)
    .order("id")
    .limit(501);
  databaseError(result.error);
  const links = (result.data ?? []).slice(0, 500) as RecordLink[];
  const targets = [
    ...new Set(
      links.flatMap((link) =>
        [
          allowed.has(link.source_id) ? link.target_id : null,
          allowed.has(link.target_id) ? link.source_id : null,
        ].filter((id): id is string => !!id),
      ),
    ),
  ];
  const records: LinkedRecord[] = [];
  for (let start = 0; start < targets.length; start += 100) {
    const batch = await client
      .from("records")
      .select("id,object_id,display_name,domain,email")
      .eq("workspace_id", workspace)
      .eq("object_id", targetObject)
      .eq("archived", false)
      .is("merged_into", null)
      .in("id", targets.slice(start, start + 100));
    databaseError(batch.error);
    records.push(...((batch.data ?? []) as LinkedRecord[]));
  }
  const visible = new Set(records.map((record) => record.id));
  return {
    links: links.filter(
      (link) =>
        (allowed.has(link.source_id) && visible.has(link.target_id)) ||
        (allowed.has(link.target_id) && visible.has(link.source_id)),
    ),
    records,
    partial: (result.data?.length ?? 0) > 500,
  };
}
