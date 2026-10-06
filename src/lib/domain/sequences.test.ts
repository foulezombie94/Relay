import { expect, it } from "vitest";
import { businessTime, nextSequenceDate, sequenceMessage } from "./sequences";
it("moves weekend deliveries to Monday in the configured timezone through DST", () => {
  expect(
    businessTime(
      new Date("2026-10-24T16:00:00Z"),
      "Europe/Paris",
    ).toISOString(),
  ).toBe("2026-10-26T08:00:00.000Z");
});
it("does not alter a valid business-hour schedule", () => {
  const d = new Date("2026-10-06T10:13:00Z");
  expect(businessTime(d, "Europe/Paris")).toBe(d);
  expect(nextSequenceDate(1, "Europe/Paris", d).toISOString()).toBe(
    "2026-10-07T10:13:00.000Z",
  );
});
it("blocks unresolved variables and subject header injection", () => {
  const step = {
    subject: "Suivi {{display_name}}",
    body: "Bonjour {{email}}",
    delay_days: 1,
  };
  expect(
    sequenceMessage(step, {
      display_name: "Ada",
      email: "ada@example.invalid",
    }),
  ).toEqual({ subject: "Suivi Ada", body: "Bonjour ada@example.invalid" });
  expect(() => sequenceMessage(step, { display_name: "Ada" })).toThrow();
  expect(() =>
    sequenceMessage(step, {
      display_name: "Ada\r\nBcc: x",
      email: "a@example.invalid",
    }),
  ).toThrow();
});
