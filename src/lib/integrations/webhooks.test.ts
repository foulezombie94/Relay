import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { verifyWebhookSignature, webhookSignature, generateWebhookSecret } from "./webhooks";

describe("webhook signatures", () => {
  it("signs timestamp and body with HMAC-SHA256", () => {
    const header = webhookSignature("whsec_test", '{"id":"1"}', 1700000000);
    expect(header).toMatch(/^t=1700000000,v1=[a-f0-9]{64}$/);
    expect(verifyWebhookSignature("whsec_test", '{"id":"1"}', header, 1700000100)).toBe(true);
  });
  it("rejects altered bodies, other secrets and stale timestamps", () => {
    const header = webhookSignature("whsec_test", "{}", 1700000000);
    expect(verifyWebhookSignature("whsec_test", '{"x":1}', header, 1700000000)).toBe(false);
    expect(verifyWebhookSignature("whsec_other", "{}", header, 1700000000)).toBe(false);
    expect(verifyWebhookSignature("whsec_test", "{}", header, 1700000400)).toBe(false);
    expect(verifyWebhookSignature("whsec_test", "{}", "garbage", 1700000000)).toBe(false);
  });
  it("generates high-entropy secrets", () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(generateWebhookSecret()).not.toBe(secret);
  });
});
