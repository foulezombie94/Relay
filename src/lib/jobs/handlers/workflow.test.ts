import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Job } from "../types";
vi.mock("server-only", () => ({}));
vi.mock("../client", () => ({ queueOperation: vi.fn() }));
vi.mock("@/lib/integrations/oauth", () => ({ connection: vi.fn() }));
vi.mock("@/lib/integrations/worker-client", () => ({ workerClient: vi.fn() }));
vi.mock("@/lib/integrations/crypto", () => ({
  unseal: () => ({ url: "https://api.example.com/hook" }),
}));
vi.mock("@/lib/integrations/workflow-http", () => ({
  resolveWorkflowDestination: vi.fn().mockResolvedValue({}),
  workflowPost: vi.fn(),
}));
import { queueOperation } from "../client";
import { workflowPost } from "@/lib/integrations/workflow-http";
import { workflowJob } from "./workflow";
const admin = {} as SupabaseClient,
  job = { id: "job", lease: "lease", type: "workflow_run" } as Job;
const effect = {
  id: "effect",
  status: "pending",
  action: { type: "webhook", body: '{"name":"{{record.name}}"}' },
  values: { record: { name: 'Alice "A"' } },
  encrypted_destination: "encrypted",
  workspace_id: "workspace",
  user_id: "user",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(queueOperation)
    .mockResolvedValue({ ok: true })
    .mockResolvedValueOnce({ external: effect });
});
describe("workflow external outbox", () => {
  it("does not repeat an action after a sending marker survived a crash", async () => {
    vi.mocked(queueOperation)
      .mockReset()
      .mockResolvedValue({ ok: true })
      .mockResolvedValueOnce({ external: { ...effect, status: "sending" } });
    await workflowJob(admin, job);
    expect(workflowPost).not.toHaveBeenCalled();
    expect(queueOperation).toHaveBeenLastCalledWith(
      admin,
      "workflow_effect_finish",
      expect.objectContaining({ state: "unknown" }),
    );
  });
  it("persists permission before sending and safely substitutes JSON values", async () => {
    vi.mocked(workflowPost).mockResolvedValue({ status: 200, body: '{"provider_id":"remote-id"}' });
    await workflowJob(admin, job);
    expect(queueOperation).toHaveBeenNthCalledWith(
      2,
      admin,
      "workflow_effect_prepare",
      expect.anything(),
    );
    expect(workflowPost).toHaveBeenCalledWith(
      "https://api.example.com/hook",
      { name: 'Alice "A"' },
      { "Idempotency-Key": "effect" },
      expect.anything(),
    );
    expect(queueOperation).toHaveBeenLastCalledWith(
      admin,
      "workflow_effect_finish",
      expect.objectContaining({
        state: "completed",
        result: { status: "accepted", provider_id: "remote-id" },
      }),
    );
  });
  it("does not send when database admission fails", async () => {
    vi.mocked(queueOperation).mockRejectedValueOnce(new Error("lease lost"));
    await workflowJob(admin, job);
    expect(workflowPost).not.toHaveBeenCalled();
  });
  it("stops after a provider timeout instead of resending blindly", async () => {
    vi.mocked(workflowPost).mockRejectedValue(new Error("timeout"));
    await workflowJob(admin, job);
    expect(queueOperation).toHaveBeenLastCalledWith(
      admin,
      "workflow_effect_finish",
      expect.objectContaining({ state: "unknown", code: "delivery_uncertain" }),
    );
  });
});
