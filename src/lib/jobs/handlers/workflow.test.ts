import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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
  it("uses the configured Groq account and model without requiring an OpenAI key", async () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "test-only-key");
    vi.stubEnv("GROQ_MODEL", "test-groq-model");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.mocked(queueOperation)
      .mockReset()
      .mockResolvedValue({ ok: true })
      .mockResolvedValueOnce({
        external: { ...effect, action: { type: "ai", input: "Analyse {{record.name}}" } },
      });
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "Résumé",
                    intent: "question",
                    next_action: "Vérifier",
                    confidence: 0.8,
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await workflowJob(admin, job);
    expect(vi.mocked(queueOperation).mock.calls.at(-1)?.[2]).toMatchObject({ state: "completed" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(workflowPost).not.toHaveBeenCalled();
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "test-groq-model",
      store: false,
      include_reasoning: false,
    });
    expect(queueOperation).toHaveBeenLastCalledWith(
      admin,
      "workflow_effect_finish",
      expect.objectContaining({
        state: "completed",
        result: expect.objectContaining({ intent: "question" }),
      }),
    );
  });
  it("reports a missing worker provider key before preparing or calling the provider", async () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.mocked(queueOperation)
      .mockReset()
      .mockResolvedValue({ ok: true })
      .mockResolvedValueOnce({ external: { ...effect, action: { type: "ai", input: "Résumé" } } });
    vi.stubGlobal("fetch", vi.fn());
    const result = await workflowJob(admin, job);
    expect(fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      committed: true,
      result: { status: "failed", error_code: "ai_not_configured" },
    });
    expect(
      vi.mocked(queueOperation).mock.calls.some((call) => call[1] === "workflow_effect_prepare"),
    ).toBe(false);
  });
  it("records a provider 429 as failed and does not retry the AI stage", async () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "test-only-key");
    vi.mocked(queueOperation)
      .mockReset()
      .mockResolvedValue({ ok: true })
      .mockResolvedValueOnce({ external: { ...effect, action: { type: "ai", input: "Résumé" } } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 429 })),
    );
    const result = await workflowJob(admin, job);
    expect(result).toMatchObject({
      committed: true,
      result: { status: "failed", error_code: "ai_provider_rate_limited" },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(queueOperation).toHaveBeenLastCalledWith(
      admin,
      "workflow_effect_finish",
      expect.objectContaining({ state: "failed", code: "ai_provider_rate_limited" }),
    );
  });
});
