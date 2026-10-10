import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { SupabaseClient } from "@supabase/supabase-js";
import { IntegrationRuntime, bindingFor, assertNoCredentialLeak, hashInput } from "./runtime";
import { IntegrationStore } from "./store";
import { encrypt, decrypt } from "./vault";
import { fixtureContext } from "./test-support";
import { GoogleProvider } from "./providers/google";
import { IntegrationError } from "./errors";
const input = { to: ["recipient@example.com"], subject: "Approved subject", body: "Approved body" };
const commandId = "00000000-0000-4000-8000-000000000005",
  lease = "00000000-0000-4000-8000-000000000006";
describe("credential-free integration execution", () => {
  beforeEach(() => {
    vi.stubEnv("INTEGRATION_VAULT_ACTIVE_KEY", "fixture");
    vi.stubEnv(
      "INTEGRATION_VAULT_KEYS",
      JSON.stringify({ fixture: Buffer.alloc(32, 3).toString("base64") }),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  function harness(commandStatus = "approved") {
    const context = fixtureContext();
    context.connection.granted_scopes = ["https://www.googleapis.com/auth/gmail.compose"];
    const store = new IntegrationStore({} as SupabaseClient),
      provider = new GoogleProvider(),
      execute = vi.spyOn(provider, "executeAction").mockResolvedValue({ id: "sent-message" });
    const call = vi.spyOn(store, "call").mockImplementation(async (_actor, operation) => {
      if (operation === "load")
        return {
          connection: context.connection,
          encrypted_credentials: encrypt(context.credentials, bindingFor(context, "credentials")),
          revision: 2,
          generation: 1,
        };
      if (operation === "command_create")
        return { id: commandId, status: commandStatus, encrypted_result: null };
      if (operation === "command_claim") return { lease };
      if (operation === "admit") return { allowed: true };
      if (operation === "refresh_claim") return lease;
      if (operation === "policy")
        return {
          can_send: true,
          can_create: true,
          always_ask_before_sending: true,
          always_ask_before_deleting: true,
        };
      if (operation === "command_load")
        return {
          encrypted_input: encrypt(
            { action: "gmail.send", input, source: "agent" },
            bindingFor(context, "command"),
          ),
          correlation_id: context.actor.correlationId,
          source: "agent",
        };
      return { ok: true };
    });
    return {
      context,
      store,
      provider,
      execute,
      call,
      runtime: new IntegrationRuntime(store, () => provider),
    };
  }
  it("sends only typed output to the caller and encrypts input/result in storage", async () => {
    const h = harness();
    const result = await h.runtime.execute(
      h.context.actor,
      h.context.connection.id,
      "gmail.send",
      input,
    );
    expect(result).toEqual({ status: "succeeded", commandId, data: { id: "sent-message" } });
    expect(h.execute).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain(h.context.credentials.accessToken);
    const create = h.call.mock.calls.find((call) => call[1] === "command_create")![2]!;
    expect(create.generation).toBe(1);
    expect(String(create.encrypted_input)).not.toContain(input.body);
    const finish = h.call.mock.calls.find((call) => call[1] === "command_finish")![2]!;
    expect(decrypt(String(finish.encrypted_result), bindingFor(h.context, "command"))).toEqual({
      id: "sent-message",
    });
  });
  it("never reaches the provider for missing scopes or a denied agent permission", async () => {
    const h = harness();
    h.context.connection.granted_scopes = [];
    await expect(
      h.runtime.execute(h.context.actor, h.context.connection.id, "gmail.send", input),
    ).rejects.toMatchObject({ code: "insufficient_scope" });
    expect(h.execute).not.toHaveBeenCalled();
    h.context.connection.granted_scopes = ["https://www.googleapis.com/auth/gmail.compose"];
    const policy = vi.spyOn(h.runtime, "policy").mockResolvedValue({
      read: false,
      create: false,
      update: false,
      send: false,
      delete: false,
      alwaysAskBeforeSending: true,
      alwaysAskBeforeDeleting: true,
    });
    await expect(
      h.runtime.execute(
        { ...h.context.actor, source: "agent" },
        h.context.connection.id,
        "gmail.send",
        input,
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(policy).toHaveBeenCalled();
    expect(h.execute).not.toHaveBeenCalled();
  });
  it("returns an exact proposal without sending for agent-originated communications", async () => {
    const h = harness("proposed");
    const result = await h.runtime.execute(
      { ...h.context.actor, source: "agent" },
      h.context.connection.id,
      "gmail.send",
      input,
    );
    expect(result.status).toBe("confirmation_required");
    expect(h.execute).not.toHaveBeenCalled();
    expect(h.call.mock.calls.find((call) => call[1] === "command_create")![2]!.confirmation).toBe(
      true,
    );
  });
  it("executes the stored confirmed parameters and source, rather than new model arguments", async () => {
    const h = harness();
    await h.runtime.executeApproved(h.context.actor, h.context.connection.id, commandId);
    expect(h.execute.mock.calls[0][2]).toEqual(input);
    expect(h.execute.mock.calls[0][0].actor.source).toBe("agent");
  });
  it("marks a timed-out external send unknown and never automatically retries it", async () => {
    const h = harness();
    h.execute.mockRejectedValue(new IntegrationError("provider_unavailable", 503));
    await expect(
      h.runtime.execute(h.context.actor, h.context.connection.id, "gmail.send", input),
    ).rejects.toMatchObject({ status: 503 });
    expect(h.call.mock.calls.find((call) => call[1] === "command_finish")![2]).toMatchObject({
      status: "unknown",
    });
    expect(h.execute).toHaveBeenCalledTimes(1);
  });
  it("blocks credential leakage in structured results before persisting or returning it", async () => {
    const h = harness();
    h.execute.mockResolvedValue({ id: h.context.credentials.accessToken });
    await expect(
      h.runtime.execute(h.context.actor, h.context.connection.id, "gmail.send", input),
    ).rejects.toMatchObject({ code: "unknown" });
    expect(h.call.mock.calls.find((call) => call[1] === "command_finish")![2]).not.toHaveProperty(
      "encrypted_result",
    );
    expect(() =>
      assertNoCredentialLeak(
        { nested: [{ [h.context.credentials.refreshToken!]: "value" }] },
        h.context.credentials,
      ),
    ).toThrow();
  });
  it("retains the existing refresh token when Google omits it during refresh", async () => {
    const h = harness();
    h.context.credentials.expiresAt = Date.now() - 1;
    vi.spyOn(h.provider, "refreshCredentials").mockResolvedValue({
      credentials: { accessToken: "new-fixture-access", expiresAt: Date.now() + 3600000 },
      scopes: [],
    });
    const loaded = await h.runtime.load(h.context.actor, h.context.connection.id);
    expect(loaded.credentials.refreshToken).toBe(h.context.credentials.refreshToken);
    expect(h.call.mock.calls.some((call) => call[1] === "refresh_finish")).toBe(true);
    expect(h.call.mock.calls.some((call) => call[1] === "refresh_release")).toBe(true);
  });
  it("marks revoked grants needs_reauth and releases the refresh lease", async () => {
    const h = harness();
    h.context.credentials.expiresAt = Date.now() - 1;
    vi.spyOn(h.provider, "refreshCredentials").mockRejectedValue(
      new IntegrationError("token_revoked", 401),
    );
    await expect(h.runtime.load(h.context.actor, h.context.connection.id)).rejects.toMatchObject({
      code: "token_revoked",
    });
    expect(h.call.mock.calls.find((call) => call[1] === "status")![2]).toMatchObject({
      status: "needs_reauth",
      generation: 1,
    });
    expect(h.call.mock.calls.some((call) => call[1] === "refresh_release")).toBe(true);
  });
  it("canonicalizes object keys without reordering recipient or cell arrays", () => {
    expect(hashInput({ b: 2, a: 1 })).toBe(hashInput({ a: 1, b: 2 }));
    expect(hashInput(["a", "b"])).not.toBe(hashInput(["b", "a"]));
  });
});
