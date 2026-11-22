import { afterEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  providerFailure,
  retryAfterSeconds,
  agentUsageCost,
  agentProviderOptions,
  parseModelJSON,
} from "./provider";
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
  it("names an unavailable model and an invalid tool call instead of a generic refusal", () => {
    const r = new Response(null, { status: 400 });
    expect(providerFailure(r, "model_decommissioned")).toMatchObject({
      code: "provider_model_unavailable",
    });
    expect(providerFailure(r, "tool_use_failed")).toMatchObject({
      code: "provider_tool_call_invalid",
    });
    expect(providerFailure(r, "insufficient_quota")).toMatchObject({
      code: "provider_failed",
    });
    expect(
      providerFailure(new Response(null, { status: 429 }), "insufficient_quota"),
    ).toMatchObject({
      code: "provider_quota_exhausted",
    });
  });
  it("never forces JSON mode on Groq but keeps it for OpenAI", () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    expect(agentProviderOptions()).not.toHaveProperty("response_format");
    vi.stubEnv("AI_PROVIDER", "openai");
    expect(agentProviderOptions()).toMatchObject({ response_format: { type: "json_object" } });
  });
  it("reads plain, fenced or surrounded JSON objects and rejects everything else", () => {
    expect(parseModelJSON('{"answer":"a"}')).toEqual({ answer: "a" });
    expect(parseModelJSON('```json\n{"answer":"b"}\n```')).toEqual({ answer: "b" });
    expect(parseModelJSON('Voici : {"answer":"c"} fin')).toEqual({ answer: "c" });
    expect(parseModelJSON("")).toBeUndefined();
    expect(parseModelJSON("[1,2]")).toBeUndefined();
    expect(parseModelJSON("pas du JSON")).toBeUndefined();
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
