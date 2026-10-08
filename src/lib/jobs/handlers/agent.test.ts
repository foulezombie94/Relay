import { beforeEach, describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Job } from "../types";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/integrations/oauth", () => ({
  connection: vi.fn(async () => ({ tokens: { access_token: "test-token", scope: "" } })),
}));
import { agentJob } from "./agent";
const job = { id: "j", lease: "l", payload: { agent_action_id: "a" } } as unknown as Job;
const action = {
  id: "85187231-cb96-4f91-949a-b1b4a0e32cc0",
  kind: "draft_email",
  workspace_id: "w",
  user_id: "u",
  status: "queued",
  input: { provider: "gmail", to: "thomas@example.test", subject: "Rappel", body: "Bonjour" },
};
function client(status = "queued", rejectPrepare = false) {
  const calls: string[] = [];
  const outcomes: unknown[] = [];
  return {
    calls,
    outcomes,
    admin: {
      rpc: vi.fn(async (_name, args) => {
        calls.push(args.operation);
        if (args.operation === "load") return { data: { ...action, status } };
        if (args.operation === "prepare")
          return rejectPrepare ? { error: { code: "42501" } } : { data: { provider: "gmail" } };
        if (args.operation === "finish") outcomes.push(args.payload);
        return { data: {} };
      }),
    } as unknown as SupabaseClient,
  };
}
describe("agent durable email effects", () => {
  beforeEach(() => vi.unstubAllGlobals());
  it("never repeats a send after crash recovery returned uncertain", async () => {
    const c = client("uncertain");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await agentJob(c.admin, job);
    expect(fetch).not.toHaveBeenCalled();
    expect(c.calls).toEqual(["load"]);
  });
  it("does not call the provider after permission was revoked", async () => {
    const c = client("queued", true);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await agentJob(c.admin, job);
    expect(fetch).not.toHaveBeenCalled();
    expect(c.outcomes[0]).toMatchObject({ state: "failed" });
  });
  it("reports sent only after a Gmail message ID, after atomic admission", async () => {
    const c = client();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        expect(c.calls).toContain("prepare");
        return Response.json({ id: "confirmed-id" });
      }),
    );
    await agentJob(c.admin, job);
    expect(c.outcomes[0]).toMatchObject({ state: "sent", result: { provider_id: "confirmed-id" } });
  });
  it("records uncertain on a connection loss with no provider retry", async () => {
    const c = client();
    const fetch = vi.fn(async () => {
      throw new TypeError("connection lost");
    });
    vi.stubGlobal("fetch", fetch);
    await agentJob(c.admin, job);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(c.outcomes[0]).toMatchObject({ state: "uncertain" });
  });
  it("does not claim success when Gmail omits its confirmation ID", async () => {
    const c = client();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({})),
    );
    await agentJob(c.admin, job);
    expect(c.outcomes[0]).toMatchObject({ state: "uncertain" });
  });
});
