import { describe, expect, it } from "vitest";
import { confirmedImport } from "./import-result";
import { resources, isResource } from "./resource-schemas";
describe("import confirmation and form normalization", () => {
  it.each([
    null,
    {},
    { inserted: 0, skipped: 0, errors: [], replayed: false },
    { inserted: -1, skipped: 0, errors: [], replayed: false },
  ])("rejects absent or zero-row import results", (result) => {
    expect(() => confirmedImport(result)).toThrow("Aucune ligne");
  });
  it("accepts confirmed inserted rows and explicitly skipped duplicates", () => {
    expect(confirmedImport({ inserted: 1, skipped: 0, errors: [], replayed: false }).inserted).toBe(
      1,
    );
    expect(confirmedImport({ inserted: 0, skipped: 1, errors: [], replayed: true }).skipped).toBe(
      1,
    );
  });
  it("trims contact fields and keeps optional email optional", () => {
    const values = {
      object_id: "30000000-0000-4000-8000-000000000003",
      display_name: " Alice ",
      email: " a@example.test ",
    };
    expect(resources.records.parse(values)).toMatchObject({
      display_name: "Alice",
      email: "a@example.test",
    });
    expect(resources.records.safeParse({ ...values, email: undefined }).success).toBe(true);
    expect(resources.records.safeParse({ ...values, email: null }).success).toBe(true);
    expect(resources.records.safeParse({ ...values, email: "bad" }).success).toBe(false);
  });
  it("rejects impossible dates and inherited resource names", () => {
    expect(resources.records.partial().safeParse({ close_date: "2026-02-31" }).success).toBe(false);
    expect(isResource("constructor")).toBe(false);
    expect(isResource("__proto__")).toBe(false);
  });
  it("rejects whitespace-only note content on the server", () => {
    expect(resources.notes.safeParse({ content: "  \n" }).success).toBe(false);
  });
});
