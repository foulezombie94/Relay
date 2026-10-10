import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const provider = vi.hoisted(() => ({
  sync: vi.fn(),
  unsubscribeWebhooks: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./registry", () => ({ providerFor: () => provider }));
import type { SupabaseClient } from "@supabase/supabase-js";
import { integrationJob } from "./jobs";
import { IntegrationRuntime, bindingFor } from "./runtime";
import { IntegrationStore } from "./store";
import { encrypt } from "./vault";
import { fixtureContext } from "./test-support";
import { IntegrationError } from "./errors";
import type { Job } from "@/lib/jobs/types";
describe("integration jobs and cursor safety", () => {
  beforeEach(() => {
    vi.stubEnv("INTEGRATION_VAULT_ACTIVE_KEY", "fixture");
    vi.stubEnv(
      "INTEGRATION_VAULT_KEYS",
      JSON.stringify({ fixture: Buffer.alloc(32, 5).toString("base64") }),
    );
    provider.sync.mockReset();
    provider.unsubscribeWebhooks.mockReset();
    provider.disconnect.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  function harness(type: Job["type"] = "integration_sync", cursor: Record<string, unknown> = {}) {
    const context = fixtureContext();
    const job: Job = {
      id: "00000000-0000-4000-8000-000000000007",
      workspace_id: context.actor.workspaceId,
      user_id: context.actor.userId,
      type,
      payload: {
        connection_id: context.connection.id,
        generation: 1,
        resource: "gmail:inbox",
        event_id: "00000000-0000-4000-8000-000000000008",
      },
      lease: "00000000-0000-4000-8000-000000000009",
      attempts: 1,
      max_attempts: 5,
    };
    vi.spyOn(IntegrationRuntime.prototype, "load").mockResolvedValue(context);
    const call = vi
      .spyOn(IntegrationStore.prototype, "call")
      .mockImplementation(async (_actor, operation) => {
        if (operation === "sync_get")
          return {
            enabled: true,
            encrypted_cursor: encrypt(cursor, bindingFor(context, "webhook")),
            cursor_revision: 7,
          };
        if (operation === "admit") return { allowed: true };
        if (operation === "webhook_load")
          return {
            encrypted_payload: encrypt(
              {
                resource: "gmail:inbox",
                historyId: "98765432109876543210",
                emailAddress: context.connection.email,
              },
              bindingFor(context, "webhook"),
            ),
          };
        if (operation === "revoke_load")
          return {
            connection: context.connection,
            encrypted_credentials: encrypt(context.credentials, bindingFor(context, "credentials")),
            subscriptions: [],
          };
        return { ok: true };
      });
    return { context, job, call, admin: {} as SupabaseClient };
  }
  it("does not let internal page counters disguise a stuck provider cursor", async () => {
    const h = harness("integration_sync", {
      historyId: "100",
      pageToken: "same-page",
      zyliad_pages: 9,
    });
    provider.sync.mockResolvedValue({
      objects: [],
      cursor: { pageToken: "same-page", historyId: "100" },
      complete: false,
    });
    await expect(integrationJob(h.admin, h.job)).rejects.toThrow("sync_cursor_not_advancing");
    expect(h.call.mock.calls.some((call) => call[1] === "sync_commit")).toBe(false);
  });
  it("commits a new page with both the cursor revision and live worker lease", async () => {
    const h = harness("integration_sync", { historyId: "100" });
    provider.sync.mockResolvedValue({
      objects: [],
      cursor: { historyId: "100", pageToken: "next" },
      complete: false,
    });
    const result = await integrationJob(h.admin, h.job);
    expect(result.runAt).toBeDefined();
    expect(h.call.mock.calls.find((call) => call[1] === "sync_commit")![2]).toMatchObject({
      generation: 1,
      revision: 7,
      job_id: h.job.id,
      job_lease: h.job.lease,
    });
  });
  it("treats Gmail historyId as a notification target and never overwrites the cursor", async () => {
    const h = harness("integration_webhook");
    await integrationJob(h.admin, h.job);
    const enqueue = h.call.mock.calls.find((call) => call[1] === "sync_enqueue")![2];
    expect(enqueue).toMatchObject({ resource: "gmail:inbox", generation: 1 });
    expect(enqueue).not.toHaveProperty("historyId");
    expect(h.call.mock.calls.some((call) => call[1] === "sync_commit")).toBe(false);
    expect(h.call.mock.calls.some((call) => call[1] === "webhook_finish")).toBe(true);
  });
  it("blocks a job issued for the previous connected account before calling the provider", async () => {
    const h = harness();
    h.context.generation = 2;
    await expect(integrationJob(h.admin, h.job)).rejects.toThrow("integration_account_changed");
    expect(provider.sync).not.toHaveBeenCalled();
  });
  it("does not declare remote revocation complete on a temporary provider outage", async () => {
    const h = harness("integration_revoke");
    provider.disconnect.mockRejectedValue(new IntegrationError("provider_unavailable", 503));
    await expect(integrationJob(h.admin, h.job)).rejects.toMatchObject({
      code: "provider_unavailable",
      retryable: true,
    });
    expect(h.call.mock.calls.some((call) => call[1] === "disconnect_finish")).toBe(false);
  });
  it("destroys local credentials only after remote revocation completes", async () => {
    const h = harness("integration_revoke");
    provider.disconnect.mockResolvedValue(undefined);
    const result = await integrationJob(h.admin, h.job);
    expect(result.result).toEqual({ disconnected: true });
    expect(h.call.mock.calls.some((call) => call[1] === "disconnect_finish")).toBe(true);
  });
});
