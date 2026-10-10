import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), clients: [] as unknown[], log: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    constructor(options: unknown) {
      mocks.clients.push(options);
    }
    verifyIdToken = mocks.verify;
  },
}));
vi.mock("@/lib/observability/logger", () => ({ logEvent: mocks.log }));
import { GoogleProvider } from "./google";
import type { ProviderContext } from "../contracts";
import { fixtureContext } from "../test-support";
const now = Date.parse("2026-10-10T12:00:00Z");
const audience = "https://zyliad.example/api/integration-webhooks/fixture";
const token = "fixture.jwt.private";
const context = {
  ...fixtureContext(),
  subscription: {
    resource: "gmail:inbox",
    audience,
    subscription: "projects/test/subscriptions/gmail",
  },
} satisfies ProviderContext;
const claims = {
  aud: audience,
  iss: "https://accounts.google.com",
  exp: now / 1000 + 3600,
  email: "pubsub@test.iam.gserviceaccount.com",
  email_verified: true,
};
function body(overrides: Record<string, unknown> = {}, notification: Record<string, unknown> = {}) {
  return Buffer.from(
    JSON.stringify({
      subscription: context.subscription?.subscription,
      message: {
        messageId: "123456",
        publishTime: new Date(now).toISOString(),
        data: Buffer.from(
          JSON.stringify({
            emailAddress: "customer@example.com",
            historyId: "98765432101234567890",
            ...notification,
          }),
        ).toString("base64"),
      },
      ...overrides,
    }),
  );
}
const headers = () => new Headers({ authorization: "Bearer " + token });
describe("authenticated Gmail Pub/Sub notifications", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.verify.mockReset();
    mocks.log.mockReset();
    vi.stubEnv("GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL", claims.email);
    mocks.verify.mockResolvedValue({ getPayload: () => ({ ...claims }) });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
  it("reuses the certificate-caching OAuth client and preserves the exact history ID", async () => {
    const first = await new GoogleProvider().handleWebhook(body(), headers(), context);
    const second = await new GoogleProvider().handleWebhook(body(), headers(), context);
    expect(first).toEqual({
      eventId: "123456",
      eventType: "gmail.history",
      occurredAt: new Date(now).toISOString(),
      payload: {
        resource: "gmail:inbox",
        historyId: "98765432101234567890",
        emailAddress: "customer@example.com",
      },
    });
    expect(second.eventId).toBe(first.eventId);
    expect(mocks.clients).toHaveLength(1);
    expect(mocks.verify).toHaveBeenCalledWith({ idToken: token, audience });
    expect(mocks.log).not.toHaveBeenCalled();
  });
  it.each([
    ["Token used too late, " + token, "expired_token"],
    ["Wrong recipient, payload audience != requiredAudience " + token, "invalid_audience"],
    ["Invalid issuer, expected one of [] " + token, "invalid_issuer"],
    ["Invalid token signature: " + token, "invalid_signature"],
    ["Unexpected failure " + token, "verification_failed"],
  ])("classifies %s without exposing the library exception", async (message, code) => {
    mocks.verify.mockRejectedValue(new Error(message));
    await expect(
      new GoogleProvider().handleWebhook(body(), headers(), context),
    ).rejects.toMatchObject({ code: "unauthorized", status: 401 });
    expect(mocks.log).toHaveBeenCalledWith("warn", "gmail_pubsub_authentication_rejected", {
      provider: "google",
      code,
      request_id: context.actor.correlationId,
    });
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain(token);
  });
  it.each([
    [{ aud: "wrong" }, "invalid_audience"],
    [{ iss: "https://evil.example" }, "invalid_issuer"],
    [{ exp: now / 1000 }, "expired_token"],
    [{ email: "wrong@example.com" }, "wrong_service_account"],
    [{ email_verified: false }, "email_not_verified"],
  ])("rejects invalid verified claims %j", async (change, code) => {
    mocks.verify.mockResolvedValue({ getPayload: () => ({ ...claims, ...change }) });
    await expect(
      new GoogleProvider().handleWebhook(body(), headers(), context),
    ).rejects.toMatchObject({ status: 401 });
    expect(mocks.log.mock.calls[0][2].code).toBe(code);
  });
  it("does not parse an unauthenticated body", async () => {
    await expect(
      new GoogleProvider().handleWebhook(Buffer.from("invalid-json"), new Headers(), context),
    ).rejects.toMatchObject({ status: 401 });
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it.each([
    [body({ subscription: "projects/other/subscriptions/gmail" }), 401],
    [body({}, { emailAddress: "other@example.com" }), 401],
    [body({}, { historyId: "not-a-number" }), 400],
    [Buffer.from("malformed"), 400],
  ])("rejects wrong subscriptions, accounts and malformed payloads", async (raw, status) => {
    await expect(new GoogleProvider().handleWebhook(raw, headers(), context)).rejects.toMatchObject(
      { status },
    );
  });
  it.each([-86_400_001, 300_001])("rejects out-of-window publishTime %i", async (offset) => {
    const parsed = JSON.parse(body().toString());
    parsed.message.publishTime = new Date(now + offset).toISOString();
    await expect(
      new GoogleProvider().handleWebhook(Buffer.from(JSON.stringify(parsed)), headers(), context),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("accepts an older history notification without treating it as the persisted cursor", async () => {
    const result = await new GoogleProvider().handleWebhook(
      body({}, { historyId: "12" }),
      headers(),
      context,
    );
    expect(result.payload.historyId).toBe("12");
  });
});
