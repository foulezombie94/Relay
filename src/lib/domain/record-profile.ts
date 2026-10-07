import type { CrmRecord, ObjectDefinition, Row } from "./types";
export function relatedRecords(
  related: CrmRecord[],
  objects: ObjectDefinition[],
  slug: string,
) {
  const ids = new Set(objects.filter((o) => o.slug === slug).map((o) => o.id));
  return related.filter(
    (r) => ids.has(r.object_id) && !r.archived && !r.merged_into,
  );
}
export function nextRecordAction(timeline: (Row & { resource: string })[]) {
  return timeline
    .filter(
      (r) =>
        ["tasks", "commitments"].includes(r.resource) &&
        !["done", "cancelled", "completed"].includes(String(r.status)),
    )
    .sort((a, b) => {
      const time = (r: Row) => {
        const t = r.due_date ? Date.parse(String(r.due_date)) : NaN;
        return Number.isFinite(t) ? t : Infinity;
      };
      return time(a) - time(b);
    })[0];
}
export function linkedDealTotals(deals: CrmRecord[]) {
  const totals: Record<string, { open: number; won: number; count: number }> =
    {};
  for (const deal of deals) {
    if (deal.archived || deal.merged_into) continue;
    const value = Number(deal.amount);
    const bucket = (totals[deal.currency || "EUR"] ??= {
      open: 0,
      won: 0,
      count: 0,
    });
    bucket.count++;
    if (!Number.isFinite(value)) continue;
    if (deal.stage === "Gagné") bucket.won += value;
    else if (deal.stage !== "Perdu") bucket.open += value;
  }
  return totals;
}
