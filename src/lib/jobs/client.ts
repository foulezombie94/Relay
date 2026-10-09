import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { databaseError } from "@/lib/api/context";
import type { JobType } from "./types";
export async function queueOperation(
  admin: SupabaseClient,
  operation: string,
  payload: Record<string, unknown> = {},
) {
  const { data, error } = await admin.rpc("relay_job_worker", { operation, payload });
  if (error) throw Object.assign(new Error("Queue operation failed"), { code: error.code });
  return data;
}
export async function enqueueJob(
  client: SupabaseClient,
  workspace: string,
  type: JobType,
  payload: Record<string, unknown>,
) {
  const { data, error } = await client.rpc("enqueue_relay_job", {
    w: workspace,
    kind: type,
    payload,
  });
  databaseError(error);
  return data as { id: string; status: string };
}
export async function workerReady(admin: SupabaseClient, type: JobType) {
  const data = await queueOperation(admin, "ready", { type });
  return data === true;
}
