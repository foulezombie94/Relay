import {
  defaultProbabilities,
  isTerminalStage,
  openStages,
  type Pipeline,
  type ForecastDeal,
} from "./pipelines";
export type HistoricalDeal = ForecastDeal & { id: string };
export type SalesSnapshot = {
  stage?: string;
  pipeline_id?: string | null;
  version?: number;
};
export type SalesAudit = {
  entity_id: string;
  created_at: string;
  before_data: SalesSnapshot | null;
  after_data: SalesSnapshot | null;
};
const terminal = (stage?: string) => !!stage && isTerminalStage(stage);
/** Outcomes use the latest audited entry into the current terminal stage, never the expected close date. */
export function salesHistory(
  deals: HistoricalDeal[],
  pipelines: Pipeline[],
  events: SalesAudit[],
  month: string,
) {
  const byId = new Map(deals.map((deal) => [deal.id, deal]));
  const observations = new Map<
    string,
    { visited: Set<string>; closedAt: string | null; finalStage?: string }
  >();
  for (const event of [...events].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) ||
      (a.after_data?.version ?? 0) - (b.after_data?.version ?? 0),
  )) {
    const deal = byId.get(event.entity_id);
    if (!deal) continue;
    const seen = observations.get(deal.id) ?? {
      visited: new Set<string>(),
      closedAt: null,
    };
    observations.set(deal.id, seen);
    for (const snapshot of [event.before_data, event.after_data]) {
      if (
        snapshot &&
        snapshot.pipeline_id === deal.pipeline_id &&
        snapshot.stage &&
        !terminal(snapshot.stage)
      )
        seen.visited.add(snapshot.stage);
    }
    const before = event.before_data?.stage,
      after = event.after_data?.stage;
    if (!after) continue;
    if (!terminal(after)) {
      seen.closedAt = null;
      seen.finalStage = after;
    } else if (before !== after) {
      seen.closedAt = event.created_at;
      seen.finalStage = after;
    }
  }
  const outcomes: Record<
    string,
    {
      won: number;
      lost: number;
      wonCount: number;
      lostCount: number;
      undated: number;
    }
  > = {};
  const calibration = pipelines.flatMap((pipeline) =>
    openStages(pipeline).map((stage) => ({
      pipelineId: pipeline.id,
      pipeline: pipeline.name,
      stage,
      label: pipeline.labels[stage] ?? stage,
      configured: pipeline.probabilities[stage] ?? defaultProbabilities[stage] ?? 0,
      won: 0,
      lost: 0,
      resolved: 0,
      rate: null as number | null,
    })),
  );
  const cells = new Map(calibration.map((row) => [row.pipelineId + ":" + row.stage, row]));
  for (const deal of deals) {
    if (!terminal(deal.stage)) continue;
    const seen = observations.get(deal.id);
    const closedAt = seen?.finalStage === deal.stage ? seen.closedAt : null;
    const bucket = (outcomes[deal.currency] ??= {
      won: 0,
      lost: 0,
      wonCount: 0,
      lostCount: 0,
      undated: 0,
    });
    if (!closedAt) {
      bucket.undated++;
      continue;
    }
    if (closedAt.slice(0, 7) === month) {
      if (deal.stage === "Gagné") {
        bucket.won += Number(deal.amount) || 0;
        bucket.wonCount++;
      } else {
        bucket.lost += Number(deal.amount) || 0;
        bucket.lostCount++;
      }
    }
    // One resolved opportunity counts once per observed stage, even after backward moves or reopening.
    for (const stage of seen!.visited) {
      const cell = cells.get(deal.pipeline_id + ":" + stage);
      if (!cell) continue;
      if (deal.stage === "Gagné") cell.won++;
      else cell.lost++;
      cell.resolved++;
    }
  }
  for (const cell of calibration)
    if (cell.resolved) cell.rate = Math.round((1000 * cell.won) / cell.resolved) / 10;
  return { month, outcomes, calibration };
}
