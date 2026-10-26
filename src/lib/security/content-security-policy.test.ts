import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./content-security-policy";
const options = {
  nonce: Buffer.alloc(32, 1).toString("base64"),
  databaseUrl: "https://fixture.supabase.co",
  development: false,
};
describe("CSP deployment configuration", () => {
  it("allows only configured browser connections and no script eval in production", () => {
    const policy = contentSecurityPolicy({
      ...options,
      sentryDsn: "https://public-key@ingest.example.test/123",
    });
    expect(policy).toContain(
      "connect-src 'self' https://fixture.supabase.co https://ingest.example.test;",
    );
    expect(policy).not.toContain("public-key");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).not.toContain("localhost");
    expect(policy).toContain("upgrade-insecure-requests");
  });
  it("allows local HMR and debugging only in development", () => {
    const policy = contentSecurityPolicy({
      ...options,
      databaseUrl: "http://127.0.0.1:54321",
      development: true,
    });
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("ws://127.0.0.1:*");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });
  it("rejects malformed nonce and insecure telemetry configuration", () => {
    expect(() => contentSecurityPolicy({ ...options, nonce: "injected; script-src *" })).toThrow();
    expect(() =>
      contentSecurityPolicy({ ...options, sentryDsn: "http://attacker.test/123" }),
    ).toThrow();
  });
});
