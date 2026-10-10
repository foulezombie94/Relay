import { describe, it, expect } from "vitest";
import {
  portalProgress,
  portalMessageSchema,
  portalDate,
  portalInitials,
  portalDirectorySchema,
} from "./portals";
describe("portal presentation and message contracts", () => {
  it("distinguishes an empty plan from a completed plan", () => {
    expect(portalProgress({ step_count: 0, completed_steps: 0 })).toBeNull();
    expect(portalProgress({ step_count: 8, completed_steps: 3 })).toBe(38);
    expect(portalProgress({ step_count: 3, completed_steps: 3 })).toBe(100);
  });
  it("matches the database message length and rejects browser authority", () => {
    expect(portalMessageSchema.parse({ content: "  Bonjour  " })).toEqual({ content: "Bonjour" });
    for (const input of [
      { content: " " },
      { content: "a".repeat(5001) },
      { content: "Hello", workspace_id: "foreign" },
      { content: "Hello", author_id: "forged" },
    ])
      expect(portalMessageSchema.safeParse(input).success).toBe(false);
  });
  it("does not turn missing dates into epoch dates", () => {
    expect(portalDate(null)).toBe("Sans date");
    expect(portalDate("invalid")).toBe("Sans date");
    expect(portalDate("2026-10-10T12:00:00Z")).toContain("2026");
  });
  it("handles blank and unicode project initials", () => {
    expect(portalInitials("Maison Atlas")).toBe("MA");
    expect(portalInitials(" ")).toBe("P");
    expect(portalInitials("Équipe Projet")).toBe("ÉP");
  });
  it("requires confirmed bounded directory metadata", () => {
    expect(
      portalDirectorySchema.safeParse({ data: [], count: 0, page: 0, manage_workspace_id: null })
        .success,
    ).toBe(true);
    expect(
      portalDirectorySchema.safeParse({ data: [], count: -1, page: 0, manage_workspace_id: null })
        .success,
    ).toBe(false);
  });
});
