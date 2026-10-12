import { it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { consentContext, matchesConsentContext } from "./consent-context";
import { createHash } from "node:crypto";
it("is distinct from the raw cookie and the SQL flow hash", () => {
  const flow = "a".repeat(43);
  const context = consentContext(flow);
  expect(context).toMatch(/^[a-f0-9]{64}$/);
  expect(context).not.toContain(flow);
  expect(context).not.toBe(createHash("sha256").update(flow).digest("hex"));
  expect(matchesConsentContext(flow, context)).toBe(true);
  expect(matchesConsentContext("b".repeat(43), context)).toBe(false);
});
it("rejects malformed, alternate-case and truncated contexts without comparison errors", () => {
  const flow = "a".repeat(43),
    context = consentContext(flow);
  for (const invalid of [
    "",
    context.slice(1),
    context.toUpperCase(),
    "z".repeat(64),
    context + "0",
  ])
    expect(matchesConsentContext(flow, invalid)).toBe(false);
});
