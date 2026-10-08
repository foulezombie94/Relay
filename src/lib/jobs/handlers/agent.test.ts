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
function client(
  status = "queued",
  rejectPrepare = false,
  input: Partial<typeof action.input> & { reply_to_id?: string } = {},
  rejectVerify = false,
) {
  const calls: string[] = [];
  const outcomes: unknown[] = [];
  return {
    calls,
    outcomes,
    admin: {
      rpc: vi.fn(async (_name, args) => {
        calls.push(args.operation);
        if (args.operation === "load")
          return { data: { ...action, input: { ...action.input, ...input }, status } };
        if (args.operation === "prepare")
          return rejectPrepare
            ? { error: { code: "42501" } }
            : { data: { provider: input.provider ?? "gmail", provider_id: "source-message" } };
        if (args.operation === "finish") outcomes.push(args.payload);
        if (args.operation === "verify_dispatch" && rejectVerify)
          return { error: { code: "42501" } };
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
  it("overwrites Outlook Reply-To, copied recipients, subject and body before sending", async () => {
    const c = client("queued", false, { provider: "outlook", reply_to_id: action.id });
    let patched: Record<string, unknown> | undefined;
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith("/createReply"))
        return Response.json({
          id: "immutable-draft",
          toRecipients: [{ emailAddress: { address: "evil@example.test" } }],
        });
      if (options.method === "PATCH") {
        patched = JSON.parse(String(options.body));
        return new Response(null, { status: 204 });
      }
      if (url.includes("?$select=subject")) return Response.json(patched);
      if (url.endsWith("/send")) {
        expect(patched).toMatchObject({
          subject: "Rappel",
          toRecipients: [{ emailAddress: { address: "thomas@example.test" } }],
          ccRecipients: [],
          bccRecipients: [],
          body: { contentType: "Text", content: "Bonjour" },
        });
        return new Response(null, { status: 202 });
      }
      return Response.json({
        id: "immutable-draft",
        isDraft: false,
        sentDateTime: "2026-10-08T12:00:00Z",
      });
    });
    vi.stubGlobal("fetch", fetch);
    await agentJob(c.admin, job);
    expect(c.outcomes[0]).toMatchObject({ state: "sent" });
    expect(fetch.mock.calls.filter(([url]) => url.endsWith("/send"))).toHaveLength(1);
  });
  it.each(["recipient", "subject", "body", "cc", "bcc"])(
    "does not send an Outlook draft whose %s differs from the approved artifact",
    async (field) => {
      const c = client("queued", false, { provider: "outlook", reply_to_id: action.id });
      const fetch = vi.fn(async (url: string, options: RequestInit) => {
        if (url.endsWith("/createReply")) return Response.json({ id: "immutable-draft" });
        if (options.method === "PATCH") return new Response(null, { status: 204 });
        return Response.json({
          subject: field === "subject" ? "Unexpected" : "Rappel",
          toRecipients: [
            {
              emailAddress: {
                address: field === "recipient" ? "evil@example.test" : "thomas@example.test",
              },
            },
          ],
          ccRecipients: field === "cc" ? [{ emailAddress: { address: "evil@example.test" } }] : [],
          bccRecipients:
            field === "bcc" ? [{ emailAddress: { address: "evil@example.test" } }] : [],
          body: { contentType: "Text", content: field === "body" ? "Hidden content" : "Bonjour" },
        });
      });
      vi.stubGlobal("fetch", fetch);
      await agentJob(c.admin, job);
      expect(fetch.mock.calls.some(([url]) => url.endsWith("/send"))).toBe(false);
      expect(c.outcomes[0]).toMatchObject({ state: "failed" });
    },
  );
  it("does not send after rights are revoked between Graph draft creation and dispatch", async () => {
    const c = client("queued", false, { provider: "outlook", reply_to_id: action.id }, true);
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith("/createReply")) return Response.json({ id: "draft" });
      if (options.method === "PATCH") return new Response(null, { status: 204 });
      return Response.json({
        subject: "Rappel",
        toRecipients: [{ emailAddress: { address: "thomas@example.test" } }],
        ccRecipients: [],
        bccRecipients: [],
        body: { contentType: "Text", content: "Bonjour" },
      });
    });
    vi.stubGlobal("fetch", fetch);
    await agentJob(c.admin, job);
    expect(fetch.mock.calls.some(([url]) => url.endsWith("/send"))).toBe(false);
    expect(c.outcomes[0]).toMatchObject({ state: "failed" });
  });
});
