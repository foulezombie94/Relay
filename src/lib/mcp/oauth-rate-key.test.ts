import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { oauthRateKey } from "./oauth-rate-key";
const request = (headers: Record<string, string> = {}) =>
  new Request("https://zyliad.example.test/api/mcp/oauth/register", { headers });
afterEach(() => vi.unstubAllEnvs());
function production() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("SUPABASE_SECRET_KEY", "synthetic-server-key");
}
it("isolates trusted proxy sources and persists neither the address nor server key", () => {
  production();
  const a = oauthRateKey(request({ "x-vercel-forwarded-for": "203.0.113.1" }));
  const b = oauthRateKey(request({ "x-vercel-forwarded-for": "203.0.113.2" }));
  expect(a).toMatch(/^[a-f0-9]{64}$/);
  expect(a).not.toBe(b);
  expect(a).not.toContain("203.0.113");
  expect(
    oauthRateKey(
      request({
        "x-vercel-forwarded-for": "203.0.113.1",
        "x-forwarded-for": "attacker",
        rate_limit_key: "forged",
      }),
    ),
  ).toBe(a);
});
it("accepts a trusted IPv6 source", () => {
  production();
  expect(oauthRateKey(request({ "x-vercel-forwarded-for": "2001:db8::1" }))).toMatch(
    /^[a-f0-9]{64}$/,
  );
});
it("fails closed for missing/malformed proxy sources", () => {
  production();
  for (const value of ["", "bad-address", "203.0.113.1, 203.0.113.2"]) {
    expect(() =>
      oauthRateKey(request({ "x-vercel-forwarded-for": value, "x-forwarded-for": "203.0.113.1" })),
    ).toThrow("Service OAuth temporairement indisponible");
  }
});
it("does not trust a spoofed Vercel header on another production host", () => {
  production();
  vi.stubEnv("VERCEL", "");
  expect(() => oauthRateKey(request({ "x-vercel-forwarded-for": "203.0.113.1" }))).toThrow(
    "Service OAuth temporairement indisponible",
  );
});
it("requires the server key in production", () => {
  production();
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
  expect(() => oauthRateKey(request({ "x-vercel-forwarded-for": "203.0.113.1" }))).toThrow(
    "Service OAuth temporairement indisponible",
  );
});
