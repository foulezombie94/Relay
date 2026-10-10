import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { proxy } from "@/proxy";

// Use the real @supabase/ssr and auth-js clients against an isolated Auth HTTP
// fixture. No production accounts, keys, or refresh tokens are used here.
const authUrl = "https://fixture.supabase.co";
const cookieName = "sb-fixture-auth-token";
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "user@example.test",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
function session(expired = false) {
  const now = Math.floor(Date.now() / 1000);
  const exp = expired ? now - 120 : now + 3600;
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({
      iss: authUrl + "/auth/v1",
      sub: user.id,
      aud: "authenticated",
      role: "authenticated",
      iat: now - 3600,
      exp,
      session_id: "00000000-0000-4000-8000-000000000002",
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", "isolated-test-signing-key")
    .update(header + "." + claims)
    .digest("base64url");
  return {
    access_token: `${header}.${claims}.${signature}`,
    refresh_token: expired ? "fixture-old-refresh" : "fixture-new-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    user,
  };
}
function cookie(value: ReturnType<typeof session>) {
  return "base64-" + Buffer.from(JSON.stringify(value)).toString("base64url");
}
function request(path: string, value: string) {
  return new NextRequest("https://relay.example" + path, {
    headers: { cookie: `${cookieName}=${value}` },
  });
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_RELAY_ENVIRONMENT", "production");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PROJECT_REF", "fixture");
  vi.stubEnv("NEXT_PUBLIC_RELAY_PRODUCTION_PROJECT_REF", "fixture");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", authUrl);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_fixture");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("real Supabase SSR session round trips", () => {
  it.each(["/login", "/"])(
    "refreshes an expired JWT once, persists the rotated refresh token and resumes without password entry from %s",
    async (path) => {
      const renewed = session();
      const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target === authUrl + "/auth/v1/token?grant_type=refresh_token") {
          expect(JSON.parse(String(init?.body)).refresh_token).toBe("fixture-old-refresh");
          return json(renewed);
        }
        if (target === authUrl + "/auth/v1/user") {
          expect(new Headers(init?.headers).get("authorization")).toBe(
            "Bearer " + renewed.access_token,
          );
          return json(user);
        }
        throw new Error("Unexpected fixture endpoint: " + target);
      });
      vi.stubGlobal("fetch", fetch);
      const req = request(path, cookie(session(true)));
      const response = await proxy(req);
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://relay.example/app/dashboard");
      const stored = response.cookies.get(cookieName)!;
      expect(stored).toBeDefined();
      expect(stored.secure).toBe(true);
      expect(stored.sameSite).toBe("lax");
      expect(stored.maxAge).toBe(400 * 86400);
      expect(stored.value).toBe(cookie(renewed));
      expect(req.cookies.get(cookieName)?.value).toBe(stored.value);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("pragma")).toBe("no-cache");

      // Simulate a new HTTP request after reopening the site with persisted cookies.
      const reopened = await proxy(request(path, stored.value));
      expect(reopened.status).toBe(307);
      expect(fetch.mock.calls.filter(([url]) => String(url).includes("/token?")).length).toBe(1);
    },
  );

  it.each(["/login", "/"])(
    "clears a revoked session instead of granting access from a still-unexpired JWT on %s",
    async (path) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => json({ error_code: "session_not_found", msg: "Session revoked" }, 401)),
      );
      const response = await proxy(request(path, cookie(session())));
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(response.cookies.get(cookieName)?.maxAge).toBe(0);
      expect(response.cookies.get(cookieName)?.value).toBe("");
    },
  );

  it.each(["/login", "/"])(
    "does not resurrect a session whose refresh token has been revoked on %s",
    async (path) => {
      const fetch = vi.fn(async () =>
        json({ error_code: "refresh_token_not_found", msg: "Refresh token revoked" }, 400),
      );
      vi.stubGlobal("fetch", fetch);
      const response = await proxy(request(path, cookie(session(true))));
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(response.cookies.get(cookieName)?.maxAge).toBe(0);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["/login", "/"])(
    "keeps persistent credentials through a temporary Auth outage and restores them on the next request on %s",
    async (path) => {
      const value = cookie(session());
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => json({ message: "Temporary upstream outage" }, 503)),
      );
      const response = await proxy(request(path, value));
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(response.cookies.get(cookieName)).toBeUndefined();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => json(user)),
      );
      const resumed = await proxy(request(path, value));
      expect(resumed.status).toBe(307);
    },
  );
});
