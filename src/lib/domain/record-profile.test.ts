import { describe, it, expect } from "vitest";
import { relatedRecords, nextRecordAction, linkedDealTotals } from "./record-profile";
import type { CrmRecord, ObjectDefinition, Row } from "./types";
const record = (extra: Partial<CrmRecord>) =>
  ({
    id: "r",
    workspace_id: "w",
    created_at: "2026-10-01",
    object_id: "deal",
    display_name: "Vente",
    email: null,
    domain: null,
    stage: "Qualification",
    amount: 1000,
    currency: "EUR",
    owner_id: null,
    attributes: {},
    archived: false,
    version: 1,
    close_date: null,
    ...extra,
  }) as CrmRecord;
describe("record-specific overview data", () => {
  it("separates companies, people and deals and excludes archived and merged relations", () => {
    const objects = [
      { id: "person", slug: "people" },
      { id: "company", slug: "companies" },
      { id: "deal", slug: "deals" },
    ] as ObjectDefinition[];
    const rows = [
      record({ id: "p", object_id: "person" }),
      record({ id: "c", object_id: "company" }),
      record({ id: "a", object_id: "person", archived: true }),
      record({ id: "m", object_id: "person", merged_into: "p" }),
    ];
    expect(relatedRecords(rows, objects, "people").map((r) => r.id)).toEqual(["p"]);
    expect(relatedRecords(rows, objects, "companies").map((r) => r.id)).toEqual(["c"]);
  });
  it("chooses the nearest open action without mistaking completed tasks or notes for next steps", () => {
    const rows = [
      { id: "note", resource: "notes", due_date: "2026-01-01" },
      {
        id: "closed",
        resource: "tasks",
        status: "done",
        due_date: "2026-01-01",
      },
      { id: "bad", resource: "tasks", due_date: "invalid" },
      {
        id: "next",
        resource: "commitments",
        status: "open",
        due_date: "2026-10-08",
      },
      {
        id: "later",
        resource: "tasks",
        status: "open",
        due_date: "2026-10-09",
      },
    ].map((row) => ({ ...row, workspace_id: "w", created_at: "2026-10-01" })) satisfies (Row & {
      resource: string;
    })[];
    expect(nextRecordAction(rows)?.id).toBe("next");
    expect(rows[0].id).toBe("note");
    expect(nextRecordAction([{ ...rows[1], status: "completed" }])).toBeUndefined();
  });
  it("keeps currencies separate and excludes won/lost and archived deals from open pipeline", () => {
    const totals = linkedDealTotals([
      record({}),
      record({ stage: "Gagné", amount: 2000 }),
      record({ stage: "Perdu", amount: 3000 }),
      record({ currency: "USD", amount: 4000 }),
      record({ archived: true, amount: 99999 }),
      record({ merged_into: "r", amount: 99999 }),
    ]);
    expect(totals.EUR.open).toBe(1000);
    expect(totals.EUR.won).toBe(2000);
    expect(totals.USD.open).toBe(4000);
  });
});
