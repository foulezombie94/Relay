import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { queueOperation } from "./client";
import { handleJob } from "./handlers";
import { PermanentJobError, backoff, type Job } from "./types";
import { logEvent } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/server";
export async function runJob(admin: SupabaseClient, job: Job) {
  const started = Date.now();
  const lease = { id: job.id, lease: job.lease };
  const fields = { job_id: job.id, job_type: job.type, attempt: job.attempts };
  let leaseLost = false;
  let renewing: Promise<unknown> | undefined;
  const renewal = setInterval(() => {
    if (!renewing)
      renewing = queueOperation(admin, "renew", lease)
        .catch(() => {
          leaseLost = true;
        })
        .finally(() => {
          renewing = undefined;
        });
  }, 45000);
  try {
    await logEvent("info", "job_started", fields);
    const outcome = await handleJob(admin, job);
    if (outcome.committed && ["failed", "unknown"].includes(String(outcome.result?.status))) {
      const raw = String(outcome.result?.error_code ?? "job_dead");
      const code = /^[a-z0-9_]{1,80}$/.test(raw) ? raw : "job_dead";
      await logEvent("error", "job_dead", { ...fields, code, duration_ms: Date.now() - started });
      reportError(code, { job_id: job.id, job_type: job.type });
      return;
    }
    if (leaseLost && !outcome.committed) throw new PermanentJobError("lease_lost");
    if (!outcome.committed)
      await queueOperation(admin, outcome.runAt ? "defer" : "complete", {
        ...lease,
        ...(outcome.runAt ? { run_at: outcome.runAt } : { result: outcome.result ?? {} }),
      });
    await logEvent("info", outcome.runAt ? "job_deferred" : "job_completed", {
      ...fields,
      duration_ms: Date.now() - started,
    });
  } catch (error) {
    const dbCode =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "job_failed";
    const permanent =
      error instanceof PermanentJobError ||
      ["42501", "22023", "23503", "23514", "P0001"].includes(dbCode);
    const code = error instanceof PermanentJobError ? error.message : dbCode;
    // Lease fencing prevents a late result from overwriting another worker's decision.
    try {
      await queueOperation(admin, "fail", {
        ...lease,
        permanent,
        code,
        retry_seconds: backoff(job.attempts),
      });
    } catch {
      await logEvent("warn", "job_lease_unavailable", fields);
    }
    await logEvent("error", "job_failed", { ...fields, code, duration_ms: Date.now() - started });
    reportError(code, { job_id: job.id, job_type: job.type });
  } finally {
    clearInterval(renewal);
    await renewing;
  }
}
