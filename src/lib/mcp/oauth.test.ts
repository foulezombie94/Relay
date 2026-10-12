import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), context: vi.fn(), oauthDb: vi.fn() }));
vi.mock("./database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./database")>()),
  oauthDb: mocks.oauthDb,
}));
vi.mock("@/lib/api/context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/context")>()),
  context: mocks.context,
}));
import { oauthGet, oauthPost, authorizationMetadata, resourceMetadata } from "./oauth";
import { hash } from "./database";
import { consentContext } from "./consent-context";
import { GET as resourceGet } from "@/app/.well-known/oauth-protected-resource/api/mcp/route";
const origin = "http://127.0.0.1:3000",
  id = "cf967873-7e4e-4d9a-b54b-8797f2583213",
  resource = origin + "/api/mcp";
function post(operation: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(origin + "/api/mcp/oauth/" + operation, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("NEXT_PUBLIC_RELAY_ENVIRONMENT", "test");
  mocks.context.mockResolvedValue({ client: { rpc: mocks.rpc } });
  mocks.oauthDb.mockResolvedValue({ client_id: id });
  mocks.rpc.mockResolvedValue({
    data: { redirect_uri: "http://127.0.0.1:54321/callback", state: "client-state" },
    error: null,
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
describe("MCP OAuth HTTP boundaries", () => {
  it("serves protected-resource discovery at the RFC9728 path", async () => {
    expect(authorizationMetadata()).toMatchObject({
      issuer: origin,
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
    expect(resourceMetadata().resource).toBe(resource);
    expect(await (await resourceGet()).json()).toMatchObject({ resource });
  });
  it("registers public clients without fetching untrusted metadata URLs", async () => {
    const r = await oauthPost(
      post("register", {
        client_name: "Claude Code",
        redirect_uris: ["http://127.0.0.1:54321/callback"],
        logo_uri: "https://evil.invalid/metadata",
        token_endpoint_auth_method: "none",
      }),
      "register",
    );
    expect(r.status).toBe(201);
    expect(await r.json()).not.toHaveProperty("logo_uri");
    expect(mocks.oauthDb).toHaveBeenCalledWith(
      "register",
      expect.not.objectContaining({ logo_uri: expect.anything() }),
    );
  });
  it("uses an opaque HttpOnly flow cookie and fixed consent destination", async () => {
    const q = new URLSearchParams({
      client_id: id,
      redirect_uri: "http://127.0.0.1:54321/callback",
      response_type: "code",
      state: "client-state",
      code_challenge: "a".repeat(43),
      code_challenge_method: "S256",
      resource,
    });
    const r = await oauthGet(
      new NextRequest(origin + "/api/mcp/oauth/authorize?" + q),
      "authorize",
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(origin + "/mcp/authorize");
    expect(r.headers.get("set-cookie")).toContain("HttpOnly");
    expect(r.headers.get("set-cookie")).toContain("SameSite=lax");
    const cookie = r.cookies.get("zyliad_mcp_flow")?.value;
    expect(cookie).toHaveLength(43);
    expect(mocks.oauthDb).toHaveBeenCalledWith(
      "begin",
      expect.objectContaining({ flow_hash: hash(cookie!) }),
    );
  });
  it("requires same-origin authenticated human consent and returns registered state/issuer", async () => {
    const body = {
      consent_context: consentContext("a".repeat(43)),
      workspace: id,
      scopes: ["records:read"],
      allow: true,
    };
    expect((await oauthPost(post("consent", body), "consent")).status).toBe(403);
    expect(
      (await oauthPost(post("consent", body, { origin: "https://evil.invalid" }), "consent"))
        .status,
    ).toBe(403);
    expect(mocks.context).not.toHaveBeenCalled();
    const r = await oauthPost(
      post("consent", body, { origin, cookie: "zyliad_mcp_flow=" + "a".repeat(43) }),
      "consent",
    );
    expect(r.status).toBe(200);
    const target = new URL((await r.json()).redirect);
    expect(target.origin).toBe("http://127.0.0.1:54321");
    expect(target.searchParams.get("state")).toBe("client-state");
    expect(target.searchParams.get("iss")).toBe(origin);
    expect(target.searchParams.get("code")).toHaveLength(43);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "mcp_consent",
      expect.objectContaining({
        flow_hash: hash("a".repeat(43)),
        w: id,
        code_hash: hash(target.searchParams.get("code")!),
      }),
    );
  });
  it("returns OAuth tokens once while sending only hashes to the vault", async () => {
    mocks.oauthDb.mockResolvedValue({ scope: "records:read", expires_in: 3600 });
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: id,
      redirect_uri: "http://127.0.0.1:54321/callback",
      code: "b".repeat(43),
      code_verifier: "v".repeat(43),
      resource,
    });
    const r = await oauthPost(
      new NextRequest(origin + "/api/mcp/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form,
      }),
      "token",
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const tokens = await r.json();
    expect(tokens.access_token).toMatch(/^zmc_a_/);
    expect(tokens.refresh_token).toMatch(/^zmc_r_/);
    const payload = mocks.oauthDb.mock.calls[0][1];
    expect(payload.access_hash).toBe(hash(tokens.access_token));
    expect(JSON.stringify(payload)).not.toContain(tokens.access_token);
    expect(JSON.stringify(payload)).not.toContain(tokens.refresh_token);
  });
  it("rejects duplicate token parameters before vault access", async () => {
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: id,
      refresh_token: "zmc_r_" + "b".repeat(43),
      resource,
    });
    form.append("resource", resource);
    const r = await oauthPost(
      new NextRequest(origin + "/api/mcp/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form,
      }),
      "token",
    );
    expect(r.status).toBe(400);
    expect(mocks.oauthDb).not.toHaveBeenCalled();
    expect(JSON.stringify(await r.json())).not.toContain("b".repeat(43));
  });
});

describe("native client OAuth refresh persistence", () => {
  function refreshRequest(params: Record<string, string>) {
    return new NextRequest(origin + "/api/mcp/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });
  }
  it("renews an existing grant without browser consent when a native client omits resource", async () => {
    mocks.oauthDb.mockResolvedValue({ scope: "records:read", expires_in: 3600 });
    const oldRefresh = "zmc_r_" + "q".repeat(43);
    const response = await oauthPost(
      refreshRequest({ grant_type: "refresh_token", client_id: id, refresh_token: oldRefresh }),
      "token",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const tokens = await response.json();
    expect(tokens.refresh_token).not.toBe(oldRefresh);
    expect(mocks.oauthDb).toHaveBeenCalledWith(
      "refresh",
      expect.objectContaining({
        client_id: id,
        resource,
        refresh_hash: hash(oldRefresh),
        access_hash: hash(tokens.access_token),
        new_refresh_hash: hash(tokens.refresh_token),
      }),
    );
    expect(mocks.context).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.oauthDb.mock.calls)).not.toContain(oldRefresh);
  });
  it("still rejects an explicit foreign audience and missing code-exchange audience", async () => {
    const response = await oauthPost(
      refreshRequest({
        grant_type: "refresh_token",
        client_id: id,
        refresh_token: "zmc_r_" + "q".repeat(43),
        resource: "https://other.example/api/mcp",
      }),
      "token",
    );
    expect(response.status).toBe(400);
    expect(mocks.oauthDb).not.toHaveBeenCalled();
    const exchange = await oauthPost(
      refreshRequest({
        grant_type: "authorization_code",
        client_id: id,
        redirect_uri: "http://127.0.0.1:54321/callback",
        code: "q".repeat(43),
        code_verifier: "v".repeat(43),
      }),
      "token",
    );
    expect(exchange.status).toBe(400);
    expect(mocks.oauthDb).not.toHaveBeenCalled();
  });
});

it("denies an unbound approval after another authorization overwrites the browser flow", async () => {
  // Page A was shown to the user, then another top-level OAuth flow replaces
  // the shared HttpOnly cookie. The old page must not approve client B.
  const replacementFlow = "c".repeat(43);
  const response = await oauthPost(
    post(
      "consent",
      { workspace: id, scopes: ["records:read"], allow: true },
      {
        origin,
        cookie: "zyliad_mcp_flow=" + replacementFlow,
      },
    ),
    "consent",
  );
  expect([400, 403]).toContain(response.status);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each([true, false])(
  "rejects a stale page context for allow=%s without consuming another flow",
  async (allow) => {
    const flowA = "a".repeat(43),
      flowB = "b".repeat(43);
    const response = await oauthPost(
      post(
        "consent",
        { consent_context: consentContext(flowA), workspace: id, scopes: ["records:read"], allow },
        { origin, cookie: "zyliad_mcp_flow=" + flowB },
      ),
      "consent",
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  },
);
it.each([true, false])("still permits matching displayed context for allow=%s", async (allow) => {
  const flow = "a".repeat(43);
  const response = await oauthPost(
    post(
      "consent",
      { consent_context: consentContext(flow), workspace: id, scopes: ["records:read"], allow },
      { origin, cookie: "zyliad_mcp_flow=" + flow },
    ),
    "consent",
  );
  expect(response.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "mcp_consent",
    expect.objectContaining({ flow_hash: hash(flow), allow }),
  );
});
