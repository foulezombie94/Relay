import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processSequence } from "@/lib/integrations/sequence-worker";
import { PermanentJobError, type Job } from "../types";
export async function sequenceJob(admin: SupabaseClient, job: Job) {
  if (typeof job.payload.enrollment_id !== "string") throw new PermanentJobError("missing_enrollment");
  return processSequence(admin, job.payload.enrollment_id);
}
