import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PermanentJobError, type Job } from "./types";
vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({ queueOperation: vi.fn() }));
vi.mock("./handlers", () => ({ handleJob: vi.fn() }));
vi.mock("@/lib/observability/logger", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/observability/server", () => ({ reportError: vi.fn() }));
import { queueOperation } from "./client";
import { handleJob } from "./handlers";
import { runJob } from "./runner";
import { logEvent } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/server";
const admin = {} as SupabaseClient;
const job: Job = {
  id: "job",
  workspace_id: "workspace",
  user_id: "user",
  type: "sequence_send",
  payload: {},
  lease: "lease",
  attempts: 1,
  max_attempts: 5,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(queueOperation).mockResolvedValue({ ok: true });
});
describe("queue runner safety", () => {
  it("alerts on a terminal workflow failure already committed by SQL without retrying it", async () => {
    vi.mocked(handleJob).mockResolvedValue({
      committed: true,
      result: { status: "failed", error_code: "record_changed" },
    });
    await runJob(admin, { ...job, type: "workflow_run" });
    expect(queueOperation).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledWith(
      "error",
      "job_dead",
      expect.objectContaining({ code: "record_changed" }),
    );
    expect(reportError).toHaveBeenCalled();
  });
  it("does not retry an uncertain email send", async () => {
    vi.mocked(handleJob).mockRejectedValue(new PermanentJobError("delivery_uncertain"));
    await runJob(admin, job);
    expect(queueOperation).toHaveBeenCalledWith(
      admin,
      "fail",
      expect.objectContaining({ permanent: true, code: "delivery_uncertain" }),
    );
    expect(queueOperation).not.toHaveBeenCalledWith(admin, "complete", expect.anything());
  });
  it("retries a provider timeout with a delay", async () => {
    vi.mocked(handleJob).mockRejectedValue(new Error("private provider response"));
    await runJob(admin, job);
    expect(queueOperation).toHaveBeenCalledWith(
      admin,
      "fail",
      expect.objectContaining({
        permanent: false,
        code: "job_failed",
        retry_seconds: expect.any(Number),
      }),
    );
  });
  it("honors provider Retry-After through a counted retry rather than an unlimited deferral", async () => {
    vi.mocked(handleJob).mockRejectedValue(
      Object.assign(new Error("provider rate limited"), { code: "rate_limited", retryAfter: 180 }),
    );
    await runJob(admin, { ...job, type: "integration_sync" });
    expect(queueOperation).toHaveBeenCalledWith(
      admin,
      "fail",
      expect.objectContaining({ retry_seconds: 180, permanent: false }),
    );
    expect(queueOperation).not.toHaveBeenCalledWith(admin, "defer", expect.anything());
  });
  it("does not commit a database job twice", async () => {
    vi.mocked(handleJob).mockResolvedValue({ committed: true, result: { inserted: 1 } });
    await runJob(admin, { ...job, type: "imports" });
    expect(queueOperation).not.toHaveBeenCalled();
  });
  it("defers outside business hours without declaring success", async () => {
    vi.mocked(handleJob).mockResolvedValue({ runAt: "2026-10-07T08:00:00Z" });
    await runJob(admin, job);
    expect(queueOperation).toHaveBeenCalledWith(admin, "defer", {
      id: job.id,
      lease: job.lease,
      run_at: "2026-10-07T08:00:00Z",
    });
  });
});
