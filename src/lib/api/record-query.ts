import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./context";
import { z } from "zod";
export const recordColumns =
  "id,workspace_id,object_id,display_name,email,domain,stage,amount,currency,owner_id,attributes,archived,version,close_date,created_at,updated_at,merged_into,pipeline_id,probability,lost_reason";
export function recordQuery(
  client: SupabaseClient,
  workspace: string,
  p: URLSearchParams,
  user: string,
  withCount = true,
) {
  let query = client
    .from("records")
    .select(recordColumns, withCount ? { count: "exact" } : {})
    .eq("workspace_id", workspace)
    .eq("archived", p.get("archived") === "true");
  if (p.get("object_id"))
    query = query.eq("object_id", z.uuid().parse(p.get("object_id")));
  if (p.get("id")) query = query.eq("id", z.uuid().parse(p.get("id")));
  if (p.get("ids"))
    query = query.in(
      "id",
      z.array(z.uuid()).max(100).parse(p.get("ids")!.split(",")),
    );
  if (p.get("lookup")) {
    const pattern = JSON.stringify(
      "%" +
        z
          .string()
          .max(200)
          .parse(p.get("lookup")!.trim())
          .replace(/[\\%_]/g, "\\$&") +
        "%",
    );
    query = query.or(
      ["display_name", "email", "domain"]
        .map((column) => column + ".ilike." + pattern)
        .join(","),
    );
  }
  if (p.get("pipeline_id"))
    query = query.eq("pipeline_id", z.uuid().parse(p.get("pipeline_id")));
  if (p.get("stage")) query = query.eq("stage", p.get("stage")!);
  if (p.get("owner")) {
    const owner = p.get("owner")!;
    if (owner === "unassigned") query = query.is("owner_id", null);
    else
      query = query.eq(
        "owner_id",
        owner === "me" ? user : z.uuid().parse(owner),
      );
  }
  if (p.get("minimum")) {
    const minimum = p.get("minimum")!;
    if (!/^\d{1,16}(\.\d{1,2})?$/.test(minimum))
      throw new ApiError("Montant minimum invalide.");
    query = query.gte("amount", minimum);
  }
  const search = p.get("q")?.trim();
  if (search)
    query = query.textSearch("search", search, {
      type: "websearch",
      config: "simple",
    });
  const sort = p.get("sort") || "updated_at";
  if (!["updated_at", "created_at", "display_name", "amount"].includes(sort))
    throw new ApiError("Tri non autorisé.");
  return query
    .order(sort, { ascending: p.get("direction") === "asc", nullsFirst: false })
    .order("id");
}
