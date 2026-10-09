import { z } from "zod";
import { stages, type Row } from "./types";
export const defaultProbabilities: Record<string, number> = {
  Nouveau: 10,
  Qualification: 25,
  Proposition: 50,
  Négociation: 75,
  Gagné: 100,
  Perdu: 0,
};
export const pipelineSchema = z.object({
  name: z.string().trim().min(1).max(120),
  probabilities: z.object({
    Nouveau: z.number().min(0).max(100),
    Qualification: z.number().min(0).max(100),
    Proposition: z.number().min(0).max(100),
    Négociation: z.number().min(0).max(100),
    Gagné: z.literal(100),
    Perdu: z.literal(0),
  }),
  labels: z
    .record(z.enum(stages as [string, ...string[]]), z.string().trim().min(1).max(80))
    .default({}),
});
export type Pipeline = Row & {
  name: string;
  probabilities: Record<string, number>;
  labels: Record<string, string>;
  version: number;
};
export type ForecastDeal = {
  stage: string;
  amount: string | number;
  currency: string;
  pipeline_id?: string | null;
  probability?: number | null;
  close_date?: string | null;
  lost_reason?: string | null;
};
export function dealProbability(deal: ForecastDeal, pipelines: Pipeline[]) {
  if (deal.stage === "Gagné") return 100;
  if (deal.stage === "Perdu") return 0;
  if (deal.probability !== null && deal.probability !== undefined) return Number(deal.probability);
  return (
    pipelines.find((p) => p.id === deal.pipeline_id)?.probabilities[deal.stage] ??
    defaultProbabilities[deal.stage] ??
    0
  );
}
export function forecastDeals(deals: ForecastDeal[], pipelines: Pipeline[]) {
  const currencies: Record<
    string,
    {
      open: number;
      weighted: number;
      won: number;
      lost: number;
      months: Record<string, { open: number; weighted: number; count: number }>;
      reasons: Record<string, number>;
    }
  > = {};
  for (const deal of deals) {
    const value = Number(deal.amount) || 0;
    const bucket = (currencies[deal.currency] ??= {
      open: 0,
      weighted: 0,
      won: 0,
      lost: 0,
      months: {},
      reasons: {},
    });
    if (deal.stage === "Gagné") {
      bucket.won += value;
      continue;
    }
    if (deal.stage === "Perdu") {
      bucket.lost += value;
      const reason = deal.lost_reason?.trim() || "Raison non renseignée";
      bucket.reasons[reason] = (bucket.reasons[reason] ?? 0) + 1;
      continue;
    }
    const weighted = Math.round(value * dealProbability(deal, pipelines)) / 100;
    bucket.open += value;
    bucket.weighted += weighted;
    const month = deal.close_date?.slice(0, 7) || "Sans date";
    const monthly = (bucket.months[month] ??= {
      open: 0,
      weighted: 0,
      count: 0,
    });
    monthly.open += value;
    monthly.weighted += weighted;
    monthly.count++;
  }
  return currencies;
}
