import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, databaseError } from "./context";
import type { Row } from "@/lib/domain/types";
export async function collect(
  client: SupabaseClient,
  workspace: string,
  table: string,
  columns = "*",
  filters: Record<string, string> = {},
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let start = 0; start <= 10000; start += 500) {
    let query = client.from(table).select(columns).eq("workspace_id", workspace);
    if (table === "records") query = query.eq("archived", false);
    for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
    const { data, error } = await query
      .order("id")
      .range(start, start + (start === 10000 ? 0 : 499));
    databaseError(error);
    if (start === 10000) {
      if (data?.length)
        throw new ApiError(
          "Ce diagnostic interactif est limité à 10 000 lignes par ressource. Réduisez le périmètre.",
          413,
        );
      return rows;
    }
    rows.push(...((data ?? []) as unknown as Row[]));
    if ((data?.length ?? 0) < 500) return rows;
  }
  return rows;
}
