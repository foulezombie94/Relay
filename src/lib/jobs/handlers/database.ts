import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { queueOperation } from "../client";
import type { Job, JobResult } from "../types";
// The SQL adapter rechecks membership and applies effects + completion atomically.
export async function databaseJob(admin: SupabaseClient, job: Job): Promise<JobResult> {
  const result = await queueOperation(admin, "execute", { id: job.id, lease: job.lease });
  return { result, committed: true };
}
