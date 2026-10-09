import { describe, expect, it } from "vitest";
import { appearanceKey, defaultAppearance, parseAppearance } from "./appearance";
describe("Personal appearance", () => {
  it("accepts only supported appearance values", () => {
    expect(parseAppearance('{"theme":"system","accent":"violet","density":"compact"}')).toEqual({
      theme: "system",
      accent: "violet",
      density: "compact",
    });
  });
  it("rejects corrupt storage and arbitrary CSS payloads", () => {
    for (const value of [
      null,
      "invalid",
      "null",
      "[]",
      '{"theme":"invalid","accent":"url(https://evil.test)","density":"hidden","secret":"anything"}',
    ])
      expect(parseAppearance(value)).toEqual(defaultAppearance);
  });
  it("separates personal preferences between users", () => {
    expect(appearanceKey("first-user")).not.toBe(appearanceKey("second-user"));
  });
});
