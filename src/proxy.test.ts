import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CookieOptions } from "@supabase/ssr";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
  getClaims: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
import { proxy } from "./proxy";

type Cookies = {
  getAll: () => { name: string; value: string }[];
  setAll: (
    items: { name: string; value: string; options: CookieOptions }[],
    headers?: Record<string, string>,
  ) => void;
};
function adapter(): Cookies {
  return mocks.createServerClient.mock.calls[0][2].cookies;
}
function request(path = "/app/dashboard") {
  return new NextRequest("https://relay.example" + path);
}
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_RELAY_ENVIRONMENT", "production");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PROJECT_REF", "fixture");
  vi.stubEnv("NEXT_PUBLIC_RELAY_PRODUCTION_PROJECT_REF", "fixture");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_fixture");
  mocks.createServerClient
    .mockReset()
    .mockReturnValue({ auth: { getUser: mocks.getUser, getClaims: mocks.getClaims } });
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: null }, error: null });
  mocks.getClaims.mockReset().mockResolvedValue({ data: null, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("Supabase session proxy", () => {
  it("preserves every rotated cookie, deletion and no-cache header across successive SDK writes", async () => {
    const req = request();
    mocks.getClaims.mockImplementation(async () => {
      const cookies = adapter();
      cookies.setAll(
        [
          {
            name: "sb-fixture-auth-token.0",
            value: "fresh-0",
            options: { secure: true, path: "/", maxAge: 34560000 },
          },
        ],
        { Expires: "0", Pragma: "no-cache" },
      );
      cookies.setAll([
        {
          name: "sb-fixture-auth-token.1",
          value: "",
          options: { secure: true, path: "/", maxAge: 0 },
        },
      ]);
      expect(cookies.getAll()).toContainEqual({
        name: "sb-fixture-auth-token.0",
        value: "fresh-0",
      });
      return { error: null };
    });
    const response = await proxy(req);
    expect(response.cookies.get("sb-fixture-auth-token.0")?.value).toBe("fresh-0");
    expect(response.cookies.get("sb-fixture-auth-token.1")?.maxAge).toBe(0);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("x-middleware-request-cookie")).toContain("fresh-0");
  });

  it("restores a server-verified session and retains refresh cookies on the login redirect", async () => {
    mocks.getUser.mockImplementation(async () => {
      adapter().setAll(
        [{ name: "sb-fixture-auth-token", value: "renewed", options: { secure: true, path: "/" } }],
        { Pragma: "no-cache" },
      );
      return { data: { user: { id: "user-a" } }, error: null };
    });
    const response = await proxy(request("/login"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://relay.example/app/dashboard");
    expect(response.cookies.get("sb-fixture-auth-token")?.value).toBe("renewed");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { status: 401, code: "session_not_found" },
    { name: "AuthRetryableFetchError", status: 503 },
  ])("never grants a session based on cookies when verification fails: %s", (error) => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error });
    return proxy(request("/login")).then((response) => {
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });
  });

  it.each(["?mode=signup", "?mode=reset"])(
    "preserves explicit signup/recovery flows: %s",
    async (query) => {
      await proxy(request("/login" + query));
      expect(mocks.getUser).not.toHaveBeenCalled();
      expect(mocks.getClaims).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["/invite", "/invite"],
    ["//evil.example", "/app/dashboard"],
    ["https://evil.example", "/app/dashboard"],
  ])("uses an allowlisted login destination: %s", async (next, target) => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-a" } }, error: null });
    const response = await proxy(request("/login?next=" + encodeURIComponent(next)));
    expect(response.headers.get("location")).toBe("https://relay.example" + target);
  });

  it("creates request-local server clients so users cannot share auth state", async () => {
    await proxy(request());
    await proxy(request());
    expect(mocks.createServerClient).toHaveBeenCalledTimes(2);
    expect(mocks.createServerClient.mock.calls[0][2].cookies).not.toBe(
      mocks.createServerClient.mock.calls[1][2].cookies,
    );
  });

  it.each(["/", "/api/health", "/api/jobs/run"])(
    "keeps unauthenticated infrastructure/landing paths isolated: %s",
    async (path) => {
      await proxy(request(path));
      expect(mocks.createServerClient).not.toHaveBeenCalled();
    },
  );

  it("keeps the anonymous landing response uncached so reopening checks auth again", async () => {
    const response = await proxy(request("/"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it.each(["sb-fixture-auth-token", "sb-fixture-auth-token.0"])(
    "opens the CRM from home only after server verification, including chunked cookies: %s",
    async (name) => {
      mocks.getUser.mockImplementation(async () => {
        adapter().setAll([{ name, value: "renewed", options: { secure: true, path: "/" } }], {
          Pragma: "no-cache",
        });
        return { data: { user: { id: "user-a" } }, error: null };
      });
      const req = request("/?mode=signup&next=//evil.example");
      req.cookies.set(name, "untrusted-session-hint");
      const response = await proxy(req);
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://relay.example/app/dashboard");
      expect(response.cookies.get(name)?.value).toBe("renewed");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("pragma")).toBe("no-cache");
      expect(mocks.getUser).toHaveBeenCalledTimes(1);
      expect(mocks.getClaims).not.toHaveBeenCalled();
    },
  );

  it.each([
    "relay_sidebar_open",
    "sb-another-project-auth-token",
    "sb-fixture-auth-token-code-verifier",
    "sb-fixture-auth-token.extra",
  ])("ignores non-session cookies on the public home: %s", async (name) => {
    const req = request("/");
    req.cookies.set(name, "fixture-value");
    const response = await proxy(req);
    expect(response.status).toBe(200);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it.each([
    { status: 401, code: "session_not_found" },
    { name: "AuthRetryableFetchError", status: 503 },
  ])("does not redirect from home when session verification fails: %s", async (error) => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error });
    const req = request("/");
    req.cookies.set("sb-fixture-auth-token", "forged-or-stale");
    const response = await proxy(req);
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("CSP script boundary", () => {
  it.each(["/", "/forms/fixture", "/demo/dashboard", "/api/health"])(
    "adds a fresh nonce even on early-return route %s and replaces client policy",
    async (path) => {
      const req = request(path);
      req.headers.set("Content-Security-Policy", "script-src 'unsafe-inline'");
      const first = await proxy(req);
      const second = await proxy(request(path));
      const policy = first.headers.get("content-security-policy")!;
      expect(policy).toContain("'strict-dynamic'");
      expect(policy).toContain("https://fixture.supabase.co");
      expect(policy).not.toMatch(/unsafe-inline.*strict-dynamic|unsafe-eval/);
      expect(policy.split(";").find((part) => part.trim().startsWith("script-src"))).not.toContain(
        "unsafe-inline",
      );
      expect(policy).toContain("frame-ancestors 'none'");
      expect(policy).not.toBe(second.headers.get("content-security-policy"));
      expect(first.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
      expect(first.headers.get("cache-control")).toBe("private, no-store");
    },
  );
  it("retains the same rendering policy after two session-cookie rotations", async () => {
    mocks.getClaims.mockImplementation(async () => {
      adapter().setAll([{ name: "sb-fixture-auth-token", value: "fresh", options: { path: "/" } }]);
      adapter().setAll([
        { name: "sb-fixture-auth-token.1", value: "tail", options: { path: "/" } },
      ]);
      return { data: null, error: null };
    });
    const response = await proxy(request());
    expect(response.headers.get("content-security-policy")).toBe(
      response.headers.get("x-middleware-request-content-security-policy"),
    );
    expect(response.headers.get("x-middleware-request-cookie")).toContain("fresh");
  });
  it("retains CSP on an authenticated login redirect", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-a" } }, error: null });
    const response = await proxy(request("/login"));
    expect(response.status).toBe(307);
    expect(response.headers.get("content-security-policy")).toContain("'strict-dynamic'");
  });
});
