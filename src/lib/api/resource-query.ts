import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ApiError } from "./context";
const searchable: Record<string, string[]> = {
  tasks: ["title", "description"],
  notes: ["title", "content"],
  meetings: ["title", "summary"],
  commitments: ["title", "source_quote"],
  conflicts: ["title", "field", "resolution"],
  handovers: ["title", "scope"],
  sequences: ["name"],
  lists: ["name"],
  portals: ["name"],
  communications: ["subject", "sender", "body"],
  pipelines: ["name"],
  email_templates: ["name", "subject", "body"],
  documents: ["name"],
  workflows: ["name"],
};
export function resourceQuery(
  client: SupabaseClient,
  workspace: string,
  resource: string,
  p: URLSearchParams,
  user: string,
) {
  const columns: string =
    resource === "audit_events" && !p.get("id")
      ? "id,workspace_id,actor_id,entity,entity_id,action,created_at,private_to"
      : "*";
  let query = client
    .from(resource)
    .select(columns, { count: "exact" })
    .eq("workspace_id", workspace);
  for (const key of [
    "id",
    "object_id",
    "record_id",
    "portal_id",
    "list_id",
    "workflow_id",
    "sequence_id",
    "enrollment_id",
    "source_id",
    "target_id",
  ])
    if (p.get(key)) query = query.eq(key, z.uuid().parse(p.get(key)));
  if (resource === "workflows" && p.get("state")) {
    const state = z.enum(["active", "draft", "paused"]).parse(p.get("state"));
    query =
      state === "draft"
        ? query.is("published_version", null)
        : state === "active"
          ? query.eq("enabled", true).not("published_version", "is", null)
          : query.eq("enabled", false).not("published_version", "is", null);
  }
  if (p.get("status")) query = query.eq("status", z.string().max(80).parse(p.get("status")));
  if (p.get("priority") && resource === "tasks")
    query = query.eq("priority", z.enum(["low", "normal", "high"]).parse(p.get("priority")));
  if (p.get("kind") && resource === "communications")
    query = query.eq("kind", z.enum(["email", "calendar"]).parse(p.get("kind")));
  if (p.get("owner") && ["tasks", "commitments", "handovers"].includes(resource)) {
    const owner = p.get("owner")!;
    query =
      owner === "unassigned"
        ? query.is("owner_id", null)
        : query.eq("owner_id", owner === "me" ? user : z.uuid().parse(owner));
  }
  const q = p.get("q")?.trim();
  if (q && searchable[resource]) {
    const pattern = JSON.stringify(
      "%" +
        z
          .string()
          .max(200)
          .parse(q)
          .replace(/[\\%_]/g, "\\$&") +
        "%",
    );
    query = query.or(searchable[resource].map((column) => column + ".ilike." + pattern).join(","));
  }
  const due = p.get("due");
  if (due && ["tasks", "commitments"].includes(resource)) {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (due === "overdue")
      query = query.lt("due_date", now.toISOString()).not("status", "in", "(done,cancelled)");
    else if (due === "today")
      query = query.gte("due_date", today.toISOString()).lt("due_date", tomorrow.toISOString());
    else if (due === "upcoming") {
      const end = new Date(now);
      end.setDate(end.getDate() + 7);
      query = query.gte("due_date", now.toISOString()).lt("due_date", end.toISOString());
    } else if (due === "undated") query = query.is("due_date", null);
    else throw new ApiError("Période non autorisée.");
  }
  const sort = p.get("sort") || "created_at";
  const allowed = [
    "created_at",
    ...(["tasks", "commitments"].includes(resource) ? ["due_date"] : []),
    ...(resource === "communications" ? ["received_at", "starts_at"] : []),
  ];
  if (!allowed.includes(sort)) throw new ApiError("Tri non autorisé.");
  return query
    .order(sort, { ascending: p.get("direction") === "asc", nullsFirst: false })
    .order("id");
}
