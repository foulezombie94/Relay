import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomBytes } from "node:crypto";
import {
  credentialSchema,
  defaultPolicy,
  needsConfirmation,
  sanitizeConnection,
  assertAgentPermission,
  type ActionDefinition,
} from "./contracts";
import { encrypt, decrypt, rotateEnvelope, loadKeyring } from "./vault";
import { verifyHmac, bodyHash } from "./webhook-security";
import { IntegrationError, retryAfter, retryDelay } from "./errors";
import { boundedJSON, providerRequest } from "./http";
import { createHmac } from "node:crypto";
const binding = {
  workspaceId: "workspace-a",
  connectionId: "connection-a",
  provider: "google" as const,
  purpose: "credentials" as const,
};
const keys = { active: "new", keys: { old: randomBytes(32), new: randomBytes(32) } };
describe("integration vault", () => {
  it("binds ciphertext to tenant, connection, provider and purpose", () => {
    const value = encrypt(
      { accessToken: "test-access", refreshToken: "test-refresh" },
      binding,
      keys,
    );
    expect(value).not.toContain("test-access");
    expect(decrypt(value, binding, keys)).toEqual({
      accessToken: "test-access",
      refreshToken: "test-refresh",
    });
    for (const changed of [
      { ...binding, workspaceId: "workspace-b" },
      { ...binding, connectionId: "connection-b" },
      { ...binding, provider: "slack" as const },
      { ...binding, purpose: "oauth" as const },
    ])
      expect(() => decrypt(value, changed, keys)).toThrow("decryption_failed");
    const corrupt = JSON.parse(value);
    corrupt.data = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(JSON.stringify(corrupt), binding, keys)).toThrow("decryption_failed");
  });
  it("rotates old envelopes without placing keys in storage", () => {
    const old = encrypt({ apiKey: "test-only" }, binding, { ...keys, active: "old" });
    const rotated = rotateEnvelope(old, binding, keys);
    expect(JSON.parse(rotated).kid).toBe("new");
    expect(decrypt(rotated, binding, { active: "new", keys: { new: keys.keys.new } })).toEqual({
      apiKey: "test-only",
    });
    expect(() => decrypt(old, binding, { active: "new", keys: { new: keys.keys.new } })).toThrow(
      "decryption_failed",
    );
  });
  it("fails closed for invalid/missing master key and malformed credentials", () => {
    expect(() =>
      loadKeyring({ INTEGRATION_VAULT_KEYS: "{}", INTEGRATION_VAULT_ACTIVE_KEY: "missing" }),
    ).toThrow();
    expect(() => credentialSchema.parse({ accessToken: "", clientSecret: "unexpected" })).toThrow();
  });
});
describe("typed actions and trust boundary", () => {
  it("requires exact approval for all critical effects and external agent communication", () => {
    expect(needsConfirmation({ risk: 3, verb: "delete" }, "user", defaultPolicy)).toBe(true);
    expect(
      needsConfirmation({ risk: 2, verb: "send" }, "agent", {
        ...defaultPolicy,
        alwaysAskBeforeSending: false,
      }),
    ).toBe(true);
    expect(needsConfirmation({ risk: 1, verb: "create" }, "agent", defaultPolicy)).toBe(false);
    expect(() =>
      assertAgentPermission(
        { verb: "read" } as ActionDefinition,
        { source: "agent" } as never,
        defaultPolicy,
      ),
    ).toThrow("permission_denied");
  });
  it("projects connection metadata even if a database response contains tokens", () => {
    const safe = sanitizeConnection({
      id: "00000000-0000-4000-8000-000000000001",
      workspace_id: "00000000-0000-4000-8000-000000000002",
      connected_by_user_id: "00000000-0000-4000-8000-000000000003",
      provider: "google",
      external_account_id: "external",
      external_account_name: "Test",
      email: null,
      auth_type: "oauth2",
      granted_scopes: [],
      enabled_integrations: [],
      status: "connected",
      last_health_check_at: null,
      last_sync_at: null,
      error_code: null,
      created_at: "today",
      updated_at: "today",
      encrypted_credentials: "secret",
      refreshToken: "secret",
      clientSecret: "secret",
    });
    expect(JSON.stringify(safe)).not.toContain("secret");
    expect(safe).not.toHaveProperty("encrypted_credentials");
  });
});
describe("webhook authentication", () => {
  it("verifies raw bytes, rejects invalid signatures and stale/future timestamps", () => {
    const raw = Buffer.from('{"id":"fixture","value": 1}'),
      secret = "fixture-signing-key",
      now = 1_800_000_000_000;
    const signature = createHmac("sha256", secret).update(raw).digest("hex");
    expect(() => verifyHmac({ raw, secret, signature, timestamp: now / 1000, now })).not.toThrow();
    for (const options of [
      { signature: "bad" },
      { raw: Buffer.from(JSON.stringify(JSON.parse(raw.toString()))) },
      { timestamp: now / 1000 - 301 },
      { timestamp: now / 1000 + 301 },
    ])
      expect(() =>
        verifyHmac({ raw, secret, signature, timestamp: now / 1000, now, ...options }),
      ).toThrow(IntegrationError);
    expect(bodyHash(raw)).not.toBe(bodyHash(Buffer.from("different")));
  });
});
describe("bounded provider transport", () => {
  beforeEach(() => vi.unstubAllGlobals());
  it("rejects off-domain calls and redirects, never reflects provider error bodies", async () => {
    const mock = vi
      .fn()
      .mockResolvedValue(
        new Response('{"access_token":"leak"}', { status: 429, headers: { "Retry-After": "12" } }),
      );
    vi.stubGlobal("fetch", mock);
    await expect(
      providerRequest(new URL("https://attacker.invalid/"), ["https://api.example.com"]),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(mock).not.toHaveBeenCalled();
    await expect(
      providerRequest(new URL("https://api.example.com/v1"), ["https://api.example.com"]),
    ).rejects.toMatchObject({ code: "rate_limited", retryAfter: 12 });
    expect(mock.mock.calls[0][1]).toMatchObject({ redirect: "error", cache: "no-store" });
  });
  it("bounds streamed responses even without Content-Length", async () => {
    await expect(boundedJSON(new Response('{"oversized":"payload"}'), 4)).rejects.toThrow(
      IntegrationError,
    );
    expect(retryAfter("999999")).toBe(3600);
    expect(retryAfter("nonsense")).toBeUndefined();
    expect(retryDelay(5, 120, 0)).toBe(120);
  });
});
