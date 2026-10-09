import "server-only";
import { jobTypes, type JobType } from "./types";
export function enabledJobTypes(): JobType[] {
  if (process.env.FEATURE_BACKGROUND_JOBS === "false") return [];
  const selected = (process.env.WORKER_JOB_TYPES ?? jobTypes.join(",")).split(",");
  return jobTypes.filter(
    (kind) =>
      selected.includes(kind) &&
      (kind !== "sequence_send" || process.env.FEATURE_SEQUENCE_SEND === "true"),
  );
}
export function backgroundJobsEnabled() {
  return process.env.FEATURE_BACKGROUND_JOBS !== "false";
}
