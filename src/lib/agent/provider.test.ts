import { afterEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { providerFailure, retryAfterSeconds, agentUsageCost } from "./provider";
afterEach(() => vi.unstubAllEnvs());
describe("provider failures and cost estimates", () => {
  it("distinguishes rate limiting from exhausted supplier credit", () => {
    const r = new Response(null, { status: 429, headers: { "retry-after": "31" } });
    expect(providerFailure(r)).toMatchObject({
      status: 429,
      code: "provider_rate_limited",
      retryAfter: 31,
    });
    expect(providerFailure(r, true)).toMatchObject({ code: "provider_quota_exhausted" });
  });
  it("supports HTTP dates and ignores malformed retry hints", () => {
    expect(
      retryAfterSeconds(new Headers({ "retry-after": "Thu, 01 Jan 1970 00:01:00 GMT" }), 0),
    ).toBe(60);
    expect(retryAfterSeconds(new Headers({ "retry-after": "garbage" }))).toBeUndefined();
  });
  it("honours a free provider price without replacing zero with a paid default", () => {
    vi.stubEnv("AGENT_INPUT_USD_PER_MILLION", "0");
    vi.stubEnv("AGENT_OUTPUT_USD_PER_MILLION", "0");
    expect(agentUsageCost(1000, 300)).toBe(0);
  });
});
