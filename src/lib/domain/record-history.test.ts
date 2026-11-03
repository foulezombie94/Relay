import { describe, expect, it } from "vitest";
import { fieldLabel, groupChanges, historyValue, type FieldChange } from "./record-history";

const change = (event_id: string, field: string): FieldChange => ({
  event_id,
  at: "2026-11-03T10:00:00Z",
  actor_id: "u",
  actor_name: "Camille",
  action: "update",
  field,
  before: "a",
  after: "b",
});
describe("record field history", () => {
  it("groups the fields of one audit event", () => {
    const groups = groupChanges([
      change("00000000-0000-4000-8000-000000000001", "email"),
      change("00000000-0000-4000-8000-000000000001", "stage"),
      change("00000000-0000-4000-8000-000000000002", "amount"),
    ]);
    expect(groups.map((g) => g.items.length)).toEqual([2, 1]);
    expect(groups[0].actor).toBe("Camille");
  });
  it("labels standard and custom fields", () => {
    expect(fieldLabel("close_date")).toBe("Clôture prévue");
    expect(fieldLabel("attributes.secteur", [{ key: "secteur", name: "Secteur" }])).toBe("Secteur");
  });
  it("renders empty, boolean and resolved values", () => {
    expect(historyValue(null)).toBe("Vide");
    expect(historyValue(true)).toBe("Oui");
    expect(historyValue(["a", "b"])).toBe("a, b");
    expect(historyValue("u1", (v) => (v === "u1" ? "Camille" : undefined))).toBe("Camille");
  });
});
