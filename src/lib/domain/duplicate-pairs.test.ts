import { describe, it, expect } from "vitest";
import { findDuplicatePairs } from "./duplicate-pairs";
import type { CrmRecord } from "./types";
const record = (id: string, override: Partial<CrmRecord> = {}): CrmRecord => ({
  id,
  workspace_id: "w",
  object_id: "people",
  display_name: "Alex Dupont",
  email: "alex@example.com",
  domain: null,
  stage: "Nouveau",
  amount: 0,
  currency: "EUR",
  owner_id: null,
  attributes: {},
  archived: false,
  version: 1,
  close_date: null,
  created_at: "2026-01-01T00:00:00Z",
  ...override,
});
describe("Duplicate suggestions and human decisions", () => {
  it("combines independent signals into one suggestion for the same pair", () => {
    const result = findDuplicatePairs([record("a"), record("b")], []);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].reasons).toContain("Même adresse email");
    expect(result.pairs[0].reasons).toContain("Même nom normalisé");
  });
  it("separates only the chosen pair in a group of three", () => {
    const result = findDuplicatePairs(
      [record("a"), record("b"), record("c")],
      [{ record_a: "a", record_b: "b", status: "separate", defer_until: null }],
    );
    expect(result.pairs.map((p) => p.key).sort()).toEqual(["a:c", "b:c"]);
  });
  it("defers a pair until the selected date and proposes it again after expiry", () => {
    const decision = {
      record_a: "a",
      record_b: "b",
      status: "deferred" as const,
      defer_until: "2026-10-13T10:00:00Z",
    };
    expect(
      findDuplicatePairs([record("a"), record("b")], [decision], Date.parse("2026-10-12T10:00:00Z"))
        .pairs,
    ).toHaveLength(0);
    expect(
      findDuplicatePairs([record("a"), record("b")], [decision], Date.parse("2026-10-14T10:00:00Z"))
        .pairs,
    ).toHaveLength(1);
  });
  it("does not combine records from different objects", () => {
    expect(
      findDuplicatePairs([record("a"), record("b", { object_id: "companies" })], []).pairs,
    ).toHaveLength(0);
  });
  it("recalculates after changes remove all matching criteria", () => {
    expect(
      findDuplicatePairs(
        [
          record("a"),
          record("b", {
            display_name: "Autre personne",
            email: "other@different.com",
          }),
        ],
        [],
      ).pairs,
    ).toHaveLength(0);
  });
  it("reports truncation rather than suggesting a complete diagnostic", () => {
    const result = findDuplicatePairs([record("a"), record("b"), record("c")], [], Date.now(), 1);
    expect(result.pairs).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });
});
