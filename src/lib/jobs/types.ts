export const jobTypes = [
  "email_sync", "calendar_sync", "sequence_send", "workflow_run", "notifications", "imports",
] as const;
export type JobType = (typeof jobTypes)[number];
export type Job = {
  id: string; workspace_id: string; user_id: string | null; type: JobType;
  payload: Record<string, unknown>; lease: string; attempts: number; max_attempts: number;
};
export class PermanentJobError extends Error {}
export type JobResult = { result?: Record<string, unknown>; runAt?: string; committed?: boolean };
export function backoff(attempt: number, random = Math.random()) {
  return Math.min(3600, 15 * 2 ** Math.min(Math.max(attempt - 1, 0), 8)) + Math.floor(random * 15);
}
