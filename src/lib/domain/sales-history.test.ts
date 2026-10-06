import { describe, it, expect } from "vitest";
import {
  salesHistory,
  type HistoricalDeal,
  type SalesAudit,
} from "./sales-history";
import type { Pipeline } from "./pipelines";
const pipeline: Pipeline = {
  id: "p",
  workspace_id: "w",
  created_at: "2026-10-01",
  name: "Principal",
  labels: {},
  version: 1,
  probabilities: {
    Nouveau: 10,
    Qualification: 25,
    Proposition: 50,
    Négociation: 75,
  },
};
const deal = (id: string, stage: string, currency = "EUR"): HistoricalDeal => ({
  id,
  stage,
  amount: 1000,
  currency,
  pipeline_id: "p",
  close_date: "2026-12-01",
});
const event = (
  id: string,
  before: string | null,
  after: string,
  date = "2026-10-06",
  version = 1,
): SalesAudit => ({
  entity_id: id,
  created_at: date,
  before_data: before ? { stage: before, pipeline_id: "p" } : null,
  after_data: { stage: after, pipeline_id: "p", version },
});
describe("audited sales outcomes", () => {
  it("uses actual terminal entry, separates currencies and ignores expected dates", () => {
    const result = salesHistory(
      [deal("a", "Gagné"), deal("b", "Perdu", "USD"), deal("c", "Gagné")],
      [pipeline],
      [
        event("a", "Qualification", "Gagné"),
        event("b", "Proposition", "Perdu"),
        event("c", "Qualification", "Gagné", "2026-09-01"),
      ],
      "2026-10",
    );
    expect(result.outcomes.EUR.won).toBe(1000);
    expect(result.outcomes.USD.lost).toBe(1000);
    expect(result.outcomes.EUR.wonCount).toBe(1);
  });
  it("does not invent closure dates or skipped stages", () => {
    const result = salesHistory(
      [deal("a", "Gagné")],
      [pipeline],
      [event("a", "Gagné", "Gagné")],
      "2026-10",
    );
    expect(result.outcomes.EUR.undated).toBe(1);
    expect(result.calibration.every((c) => c.rate === null)).toBe(true);
  });
  it("counts resolved deals once per observed stage and excludes open deals", () => {
    const result = salesHistory(
      [deal("a", "Gagné"), deal("b", "Perdu"), deal("c", "Qualification")],
      [pipeline],
      [
        event("a", null, "Qualification"),
        event("a", "Qualification", "Proposition", "2026-10-06", 2),
        event("a", "Proposition", "Qualification", "2026-10-06", 3),
        event("a", "Qualification", "Gagné", "2026-10-06", 4),
        event("b", "Qualification", "Perdu"),
        event("c", null, "Qualification"),
      ],
      "2026-10",
    );
    const row = result.calibration.find((c) => c.stage === "Qualification")!;
    expect(row).toMatchObject({ won: 1, lost: 1, resolved: 2, rate: 50 });
  });
  it("uses the latest outcome after reopening and ignores edits of a terminal deal", () => {
    const result = salesHistory(
      [deal("a", "Gagné")],
      [pipeline],
      [
        event("a", "Qualification", "Gagné", "2026-09-01"),
        event("a", "Gagné", "Qualification", "2026-09-10", 2),
        event("a", "Qualification", "Gagné", "2026-10-02", 3),
        event("a", "Gagné", "Gagné", "2026-11-01", 4),
      ],
      "2026-10",
    );
    expect(result.outcomes.EUR.wonCount).toBe(1);
  });
  it("does not attribute another pipeline stage to the current pipeline", () => {
    const old = event("a", null, "Proposition");
    old.after_data!.pipeline_id = "old";
    const result = salesHistory(
      [deal("a", "Gagné")],
      [pipeline],
      [old, event("a", "Négociation", "Gagné")],
      "2026-10",
    );
    expect(
      result.calibration.find((c) => c.stage === "Proposition")!.rate,
    ).toBeNull();
    expect(
      result.calibration.find((c) => c.stage === "Négociation")!.rate,
    ).toBe(100);
  });
});
