import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, databaseError } from "./context";
import type { AssistantPulse, PulseSignal } from "@/lib/domain/assistant-pulse";

type Result = { count: number | null; error: { message: string; code?: string } | null };
function exact(result: Result) {
  databaseError(result.error);
  if (result.count === null || !Number.isSafeInteger(result.count) || result.count < 0)
    throw new ApiError("Le compteur Pulse n’est pas disponible.", 503);
  return result.count;
}
export async function readAssistantPulse(
  client: SupabaseClient,
  workspace: string,
  user: string,
  signal: AbortSignal,
  now = new Date(),
): Promise<AssistantPulse> {
  const stamp = now.toISOString();
  const soon = new Date(now.getTime() + 7 * 86400000).toISOString();
  const old = new Date(now.getTime() - 14 * 86400000).toISOString();
  const object = await client
    .from("objects")
    .select("id")
    .eq("workspace_id", workspace)
    .eq("slug", "deals")
    .abortSignal(signal)
    .maybeSingle();
  databaseError(object.error);
  if (!object.data) throw new ApiError("Les opportunités ne sont pas accessibles.", 403);
  const [deals, tasks, overdue, commitments, conflicts, stale, emails] = await Promise.all([
    client
      .from("records")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace)
      .eq("object_id", object.data.id)
      .eq("archived", false)
      .abortSignal(signal),
    client
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace)
      .in("status", ["open", "in_progress"])
      .abortSignal(signal),
    client
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace)
      .in("status", ["open", "in_progress"])
      .lt("due_date", stamp)
      .abortSignal(signal),
    client
      .from("commitments")
      .select("id,record_id,title", { count: "exact" })
      .eq("workspace_id", workspace)
      .in("status", ["confirmed", "in_progress"])
      .lte("due_date", soon)
      .order("due_date")
      .limit(1)
      .abortSignal(signal),
    client
      .from("conflicts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace)
      .eq("status", "open")
      .abortSignal(signal),
    client
      .from("records")
      .select("id,display_name")
      .eq("workspace_id", workspace)
      .eq("object_id", object.data.id)
      .eq("archived", false)
      .not("stage", "in", '("Gagné","Perdu")')
      .lt("updated_at", old)
      .order("updated_at")
      .limit(1)
      .abortSignal(signal),
    client
      .from("communications")
      .select("id,record_id,integration_id,thread_id,received_at")
      .eq("workspace_id", workspace)
      .eq("user_id", user)
      .eq("kind", "email")
      .eq("direction", "inbound")
      .not("record_id", "is", null)
      .not("thread_id", "is", null)
      .neq("thread_id", "")
      .gte("received_at", old)
      .lte("received_at", stamp)
      .order("received_at", { ascending: false })
      .limit(3)
      .abortSignal(signal),
  ]);
  const counts = {
    attention: 0,
    opportunities: exact(deals),
    open_tasks: exact(tasks),
    overdue_tasks: exact(overdue),
    due_commitments: exact(commitments),
    open_conflicts: exact(conflicts),
  };
  counts.attention = counts.overdue_tasks + counts.due_commitments + counts.open_conflicts;
  databaseError(stale.error);
  databaseError(emails.error);
  const candidates = emails.data ?? [];
  const checked = await Promise.all(
    candidates.map(async (email) => {
      const replied = await client
        .from("communications")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace)
        .eq("user_id", user)
        .eq("kind", "email")
        .eq("direction", "outbound")
        .eq("integration_id", email.integration_id)
        .eq("thread_id", email.thread_id)
        .gte("received_at", email.received_at)
        .abortSignal(signal);
      return exact(replied) === 0 ? email : null;
    }),
  );
  const email = checked.find(Boolean),
    deal = stale.data?.[0],
    promise = commitments.data?.[0];
  const signals: PulseSignal[] = [
    {
      kind: "email",
      detected: !!email,
      ...(email ? { source_id: email.id, record_id: email.record_id } : {}),
    },
    {
      kind: "deal",
      detected: !!deal,
      ...(deal ? { record_id: deal.id, label: String(deal.display_name).slice(0, 160) } : {}),
    },
    {
      kind: "commitment",
      detected: !!promise,
      ...(promise
        ? {
            source_id: promise.id,
            ...(promise.record_id ? { record_id: promise.record_id } : {}),
            label: String(promise.title).slice(0, 160),
          }
        : {}),
    },
  ];
  return { counts, signals, generated_at: stamp, email_candidates_scanned: candidates.length };
}
