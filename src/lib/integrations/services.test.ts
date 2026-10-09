import { afterEach, describe, expect, it, vi } from "vitest";
import { services, hasRequiredScopes, callbackOrigin } from "./services";
import { seal, unseal } from "./crypto";
afterEach(() => vi.unstubAllEnvs());
describe("Integration boundaries", () => {
  it("requests mail and calendars separately", () => {
    expect(services.gmail.scopes.join(" ")).not.toContain("calendar");
    expect(services["google-calendar"].scopes.join(" ")).not.toContain("gmail");
    expect(services.outlook.scopes.join(" ")).not.toContain("Calendars");
    expect(services["outlook-calendar"].scopes.join(" ")).not.toContain("Mail.");
  });
  it("rejects partial consent and accepts qualified Microsoft scopes", () => {
    expect(hasRequiredScopes("gmail", ["https://www.googleapis.com/auth/gmail.readonly"])).toBe(
      false,
    );
    expect(
      hasRequiredScopes("outlook", [
        "https://graph.microsoft.com/User.Read",
        "https://graph.microsoft.com/Mail.Read",
        "https://graph.microsoft.com/Mail.Send",
      ]),
    ).toBe(true);
  });
  it("preserves local cookie origin and enforces HTTPS in production", () => {
    expect(callbackOrigin("http://localhost:3000", "http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3000",
    );
    expect(() => callbackOrigin("http://crm.example.com", undefined, true)).toThrow();
    expect(() => callbackOrigin("https://user:pass@crm.example.com", undefined, true)).toThrow();
  });
  it("encrypts tokens and rejects altered ciphertext", () => {
    vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    const encrypted = seal({ refresh_token: "fixture-token" });
    expect(encrypted).not.toContain("fixture-token");
    expect(unseal(encrypted)).toEqual({ refresh_token: "fixture-token" });
    const bytes = Buffer.from(encrypted, "base64url");
    bytes[bytes.length - 1] ^= 1;
    expect(() => unseal(bytes.toString("base64url"))).toThrow();
  });
});
