import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Job, JobResult, JobType } from "../types";
import { syncJob } from "./sync";
import { sequenceJob } from "./sequence";
import { databaseJob } from "./database";
const handlers: Record<JobType, (admin: SupabaseClient, job: Job) => Promise<JobResult>> = {
  email_sync: syncJob, calendar_sync: syncJob, sequence_send: sequenceJob,
  workflow_run: databaseJob, notifications: databaseJob, imports: databaseJob,
};
export function handleJob(admin: SupabaseClient, job: Job) { return handlers[job.type](admin, job); }
