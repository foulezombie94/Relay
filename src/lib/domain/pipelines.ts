import { z } from "zod";
import { type Row } from "./types";
export const defaultProbabilities: Record<string, number> = {
  Nouveau: 10,
  Qualification: 25,
  Proposition: 50,
  Négociation: 75,
  Gagné: 100,
  Perdu: 0,
};
export const terminalStages = ["Gagné", "Perdu"] as const;
export const defaultOpenStages = ["Nouveau", "Qualification", "Proposition", "Négociation"];
export const isTerminalStage = (stage: string) => stage === "Gagné" || stage === "Perdu";
const stageName = z
  .string()
  .trim()
  .min(1, "Nommez chaque étape.")
  .max(80, "Un nom d’étape compte au plus 80 caractères.")
  .refine((value) => !isTerminalStage(value), "Gagné et Perdu sont des étapes réservées.");
export const pipelineSchema = z.object({
  name: z.string().trim().min(1).max(120),
  stages: z.array(stageName).min(1).max(20).optional(),
  probabilities: z.record(z.string(), z.number().min(0).max(100)),
  labels: z.record(z.string(), z.string().trim().min(1).max(80)).optional(),
});
/** Full pipeline validation, mirrored by relay_private.validate_pipeline(). */
export const pipelineInputSchema = pipelineSchema.superRefine((value, ctx) => {
  const stages = value.stages ?? defaultOpenStages;
  const keys = new Set(stages.map((stage) => stage.toLocaleLowerCase("fr")));
  if (keys.size !== stages.length)
    ctx.addIssue({ code: "custom", message: "Deux étapes portent le même nom." });
  const allowed = new Set([...stages, ...terminalStages]);
  for (const stage of allowed)
    if (value.probabilities[stage] === undefined)
      ctx.addIssue({ code: "custom", message: `Probabilité manquante pour « ${stage} ».` });
  for (const key of Object.keys(value.probabilities))
    if (!allowed.has(key)) ctx.addIssue({ code: "custom", message: "Probabilité sans étape." });
  for (const key of Object.keys(value.labels ?? {}))
    if (!allowed.has(key)) ctx.addIssue({ code: "custom", message: "Libellé sans étape." });
  if (value.probabilities["Gagné"] !== 100 || value.probabilities["Perdu"] !== 0)
    ctx.addIssue({ code: "custom", message: "Gagné reste à 100 % et Perdu à 0 %." });
});
export type Pipeline = Row & {
  name: string;
  stages?: string[];
  probabilities: Record<string, number>;
  labels: Record<string, string>;
  version: number;
};
/** Ordered open stages followed by the two reserved terminal stages. */
export function pipelineStages(pipeline?: Pick<Pipeline, "stages"> | null) {
  const open = pipeline?.stages?.length ? pipeline.stages : defaultOpenStages;
  return [...open, ...terminalStages];
}
export function openStages(pipeline?: Pick<Pipeline, "stages"> | null) {
  return pipelineStages(pipeline).filter((stage) => !isTerminalStage(stage));
}
export function stageLabel(pipeline: Pick<Pipeline, "labels"> | null | undefined, stage: string) {
  return pipeline?.labels?.[stage] || stage;
}
/** Board columns: the pipeline order, plus stages found on rows from other pipelines. */
export function boardStages(
  pipeline: Pick<Pipeline, "stages"> | null | undefined,
  rows: { stage: string }[],
  pipelines: Pick<Pipeline, "stages">[] = [],
) {
  const base = pipeline ? openStages(pipeline) : [...openStages(pipelines[0])];
  if (!pipeline)
    for (const other of pipelines.slice(1))
      for (const stage of openStages(other)) if (!base.includes(stage)) base.push(stage);
  for (const row of rows)
    if (row.stage && !isTerminalStage(row.stage) && !base.includes(row.stage)) base.push(row.stage);
  return [...base, ...terminalStages];
}
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
