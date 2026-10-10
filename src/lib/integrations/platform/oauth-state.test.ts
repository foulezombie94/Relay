import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  appOrigin,
  beginOAuth,
  callbackURL,
  consumeOAuth,
  returnURL,
  stateBinding,
  stateHash,
} from "./oauth-state";
import { IntegrationStore } from "./store";
import { GoogleProvider } from "./providers/google";
import { decrypt, encrypt } from "./vault";
import { fixtureContext } from "./test-support";
describe("OAuth browser/session/tenant binding", () => {
  beforeEach(() => {
    vi.stubEnv("INTEGRATION_VAULT_ACTIVE_KEY", "fixture");
    vi.stubEnv(
      "INTEGRATION_VAULT_KEYS",
      JSON.stringify({ fixture: Buffer.alloc(32, 4).toString("base64") }),
    );
    vi.stubEnv("APP_URL", "https://zyliad.example");
    vi.stubEnv("GOOGLE_CLIENT_ID", "fixture");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  it("creates a random state and S256 challenge while storing the verifier encrypted", async () => {
    const context = fixtureContext(),
      store = new IntegrationStore({} as SupabaseClient),
      provider = new GoogleProvider();
    const call = vi.spyOn(store, "call").mockResolvedValue({ connection: context.connection });
    const result = await beginOAuth(store, context.actor, provider, ["gmail"], ["openid", "email"]);
    const url = new URL(result.url),
      state = url.searchParams.get("state")!;
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const payload = call.mock.calls[0][2]!;
    expect(payload.hashed_state).toBe(stateHash(state));
    expect(payload).not.toHaveProperty("state");
    expect(payload).not.toHaveProperty("verifier");
    const binding = stateBinding(context.actor, provider, stateHash(state));
    const stored = decrypt(String(payload.encrypted_verifier), binding) as { verifier: string };
    expect(stored.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("code_challenge")).not.toBe(stored.verifier);
    expect(() =>
      decrypt(result.cookieValue, { ...binding, workspaceId: "another-workspace" }),
    ).toThrow();
  });
  it("rejects missing cookies, invalid state and expired browser binding before consuming state", async () => {
    const { actor } = fixtureContext(),
      provider = new GoogleProvider(),
      store = new IntegrationStore({} as SupabaseClient),
      call = vi.spyOn(store, "call"),
      state = "a".repeat(43);
    await expect(consumeOAuth(store, actor, provider, "invalid", "cookie")).rejects.toMatchObject({
      status: 401,
    });
    await expect(consumeOAuth(store, actor, provider, state, undefined)).rejects.toMatchObject({
      status: 401,
    });
    const cookie = encrypt(
      { userId: actor.userId, expiresAt: Date.now() - 1 },
      stateBinding(actor, provider, stateHash(state)),
    );
    await expect(consumeOAuth(store, actor, provider, state, cookie)).rejects.toMatchObject({
      status: 401,
    });
    expect(call).not.toHaveBeenCalled();
  });
  it("requires the same session user and consumes only server-bound callback/return URLs", async () => {
    const context = fixtureContext(),
      { actor } = context,
      provider = new GoogleProvider(),
      store = new IntegrationStore({} as SupabaseClient),
      state = "b".repeat(43),
      binding = stateBinding(actor, provider, stateHash(state));
    const cookie = encrypt({ userId: actor.userId, expiresAt: Date.now() + 100000 }, binding);
    const call = vi.spyOn(store, "call").mockResolvedValue({
      connection_id: context.connection.id,
      encrypted_verifier: encrypt(
        {
          verifier: "fixture-verifier",
          path: "/app/integrations",
          redirectUri: callbackURL(provider, actor.workspaceId),
        },
        binding,
      ),
      requested_scopes: [],
      requested_integrations: ["gmail"],
    });
    await expect(
      consumeOAuth(store, { ...actor, userId: context.connection.id }, provider, state, cookie),
    ).rejects.toMatchObject({ status: 401 });
    expect(call).not.toHaveBeenCalled();
    expect((await consumeOAuth(store, actor, provider, state, cookie)).path).toBe(
      "/app/integrations",
    );
  });
  it("rejects external returns, URL credentials, production HTTP and unsafe dev hosts", () => {
    for (const path of [
      "https://evil.example",
      "//evil.example",
      "/app/integrations?next=evil",
      "/app/settings/../integrations",
    ])
      expect(() => returnURL(path)).toThrow();
    for (const value of [
      "http://zyliad.example",
      "https://user:pass@zyliad.example",
      "https://zyliad.example/path",
      "https://zyliad.example?next=evil",
    ])
      expect(() => appOrigin(value, true)).toThrow();
    expect(appOrigin("http://127.0.0.1:3000", false)).toBe("http://127.0.0.1:3000");
    expect(() => appOrigin("http://remote.example", false)).toThrow();
  });
});
