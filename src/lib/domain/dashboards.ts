import { z } from "zod";

export const dashboardPeriods = [
  "all",
  "this_month",
  "last_month",
  "last_30",
  "last_90",
  "quarter",
  "year",
  "custom",
] as const;
export const dashboardVisuals = [
  "kpi",
  "bars",
  "columns",
  "line",
  "area",
  "donut",
  "table",
  "funnel",
  "goal",
  "pie",
  "ranking",
  "radar",
  "treemap",
  "heatmap",
  "combo",
  "gauge",
  "stat_grid",
  "list",
  "board",
  "calendar",
  "timeline",
  "gallery",
  "text",
  "divider",
  "links",
] as const;
export const dashboardRecordVisuals = ["list", "board", "calendar", "timeline", "gallery"] as const;
export const dashboardContentVisuals = ["text", "divider", "links"] as const;
export const dashboardLinkPaths = [
  "/app/people",
  "/app/companies",
  "/app/deals",
  "/app/tasks",
  "/app/notes",
  "/app/meetings",
  "/app/assistant",
  "/app/integrations",
  "/app/reports",
  "/app/workflows",
] as const;
export function isRecordVisual(visual: string) {
  return (dashboardRecordVisuals as readonly string[]).includes(visual);
}
export function isContentVisual(visual: string) {
  return (dashboardContentVisuals as readonly string[]).includes(visual);
}
export const dashboardMetrics = [
  "count",
  "amount",
  "average_amount",
  "weighted_amount",
  "win_rate",
  "completion_rate",
  "avg_stage_days",
  "avg_cycle_days",
  "stage_reached",
] as const;
export const dashboardKinds = ["record", "task", "commitment", "email", "meeting"] as const;
export const dashboardDimensions = [
  "none",
  "stage",
  "owner",
  "pipeline",
  "status",
  "month",
  "week",
  "day",
  "provider",
  "direction",
] as const;
export const metricLabels: Record<(typeof dashboardMetrics)[number], string> = {
  count: "Nombre",
  amount: "Montant total",
  average_amount: "Montant moyen",
  weighted_amount: "Prévision pondérée",
  win_rate: "Taux de gain",
  completion_rate: "Taux de réalisation",
  avg_stage_days: "Ancienneté dans l’étape",
  avg_cycle_days: "Durée du cycle gagné",
  stage_reached: "Passages observés par étape",
};
export const visualLabels: Record<(typeof dashboardVisuals)[number], string> = {
  kpi: "Indicateur",
  bars: "Barres horizontales",
  columns: "Colonnes",
  line: "Courbe",
  area: "Aire",
  donut: "Anneau",
  table: "Tableau",
  funnel: "Pipeline / parcours",
  goal: "Objectif",
  pie: "Camembert",
  ranking: "Classement",
  radar: "Radar",
  treemap: "Carte proportionnelle",
  heatmap: "Carte de chaleur",
  combo: "Graphique combiné",
  gauge: "Jauge",
  stat_grid: "Cartes de répartition",
  list: "Liste de fiches",
  board: "Board Kanban",
  calendar: "Calendrier",
  timeline: "Chronologie",
  gallery: "Galerie de fiches",
  text: "Note et texte",
  divider: "Titre de section",
  links: "Raccourcis",
};
export const kindLabels = {
  record: "Fiches",
  task: "Tâches",
  commitment: "Engagements",
  email: "Emails importés",
  meeting: "Réunions",
};
export const dimensionLabels: Record<(typeof dashboardDimensions)[number], string> = {
  none: "Total",
  stage: "Étape",
  owner: "Responsable",
  pipeline: "Pipeline",
  status: "Statut",
  month: "Mois",
  week: "Semaine",
  day: "Jour",
  provider: "Fournisseur",
  direction: "Sens du message",
};
export const periodLabels: Record<(typeof dashboardPeriods)[number], string> = {
  all: "Toutes les dates",
  this_month: "Ce mois",
  last_month: "Mois précédent",
  last_30: "30 derniers jours",
  last_90: "90 derniers jours",
  quarter: "Ce trimestre",
  year: "Cette année",
  custom: "Dates personnalisées",
};
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const parsed = new Date(v + "T00:00:00.000Z");
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
  }, "Date invalide");
export const dashboardSettings = z
  .object({
    period: z.enum(dashboardPeriods).default("all"),
    since: date.optional(),
    until: date.optional(),
    pipeline_id: z.uuid().optional(),
    owner_id: z.uuid().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    compare: z.boolean().default(true),
    refresh_seconds: z.union([z.literal(0), z.literal(60), z.literal(300)]).default(0),
    cover: z.enum(["none", "slate", "lavender", "blue"]).optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.period === "custom" && (!s.since || !s.until || s.since > s.until))
      ctx.addIssue({
        code: "custom",
        message: "Choisissez une période complète dans l’ordre chronologique.",
      });
  });
const tileShape = z
  .object({
    id: z.uuid().optional(),
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().max(300).default(""),
    kind: z.enum(dashboardKinds),
    group_by: z.enum(dashboardDimensions).default("none"),
    metric: z.enum(dashboardMetrics).default("count"),
    object_id: z.uuid().optional(),
    pipeline_id: z.uuid().optional(),
    owner_id: z.uuid().optional(),
    stage: z.string().max(80).optional(),
    status: z.string().max(80).optional(),
    since: z.iso.datetime({ offset: true }).optional(),
    until: z.iso.datetime({ offset: true }).optional(),
    overdue: z.boolean().optional(),
    lifecycle: z.enum(["all", "open", "won", "lost"]).default("all"),
    date_field: z.enum(["created", "occurred", "due", "closed"]).default("created"),
    visual: z.enum(dashboardVisuals).default("table"),
    size: z.enum(["small", "third", "medium", "large"]).default("medium"),
    height: z.enum(["compact", "standard", "tall"]).optional(),
    content: z.string().trim().max(1500).optional(),
    links: z
      .array(
        z
          .object({ label: z.string().trim().min(1).max(60), href: z.enum(dashboardLinkPaths) })
          .strict(),
      )
      .max(8)
      .optional(),
    color: z.enum(["blue", "violet", "teal", "amber", "rose"]).default("blue"),
    goal: z.number().finite().positive().max(1e15).optional(),
    goal_currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
  })
  .strict();
export type ReportTile = z.infer<typeof tileShape>;
export function dimensionsFor(kind: ReportTile["kind"]): ReportTile["group_by"][] {
  return [
    "none",
    "day",
    "week",
    "month",
    ...(kind === "record"
      ? (["stage", "pipeline", "owner"] as const)
      : kind === "task" || kind === "commitment"
        ? (["status", "owner"] as const)
        : kind === "email"
          ? (["provider", "direction"] as const)
          : (["provider"] as const)),
  ];
}
export function metricsFor(kind: ReportTile["kind"]): ReportTile["metric"][] {
  return kind === "record"
    ? [...dashboardMetrics.filter((m) => m !== "completion_rate")]
    : kind === "task" || kind === "commitment"
      ? ["count", "completion_rate"]
      : ["count"];
}
export function isMoneyMetric(metric: ReportTile["metric"]) {
  return ["amount", "average_amount", "weighted_amount"].includes(metric);
}
export const reportTile = tileShape.superRefine((t, ctx) => {
  if (!dimensionsFor(t.kind).includes(t.group_by) || !metricsFor(t.kind).includes(t.metric))
    ctx.addIssue({
      code: "custom",
      message: "Cette mesure ou dimension ne convient pas aux données choisies.",
    });
  if (t.kind !== "record" && (t.object_id || t.pipeline_id || t.stage || t.lifecycle !== "all"))
    ctx.addIssue({
      code: "custom",
      message: "Les filtres d’opportunités ne s’appliquent qu’aux fiches.",
    });
  if (!["record", "task", "commitment"].includes(t.kind) && t.owner_id)
    ctx.addIssue({ code: "custom", message: "Cette source ne possède pas de responsable CRM." });
  if (!["task", "commitment"].includes(t.kind) && (t.status || t.overdue))
    ctx.addIssue({ code: "custom", message: "Ce filtre de tâche ne convient pas à cette source." });
  if (
    (t.date_field === "closed" && t.kind !== "record") ||
    (t.date_field === "due" && !["task", "commitment"].includes(t.kind))
  )
    ctx.addIssue({ code: "custom", message: "Ce champ de date ne convient pas à cette source." });
  if (t.since && t.until && Date.parse(t.since) >= Date.parse(t.until))
    ctx.addIssue({ code: "custom", message: "La fin doit suivre le début de la période." });
  if (t.metric === "stage_reached" && t.group_by !== "stage")
    ctx.addIssue({ code: "custom", message: "Les passages observés se regroupent par étape." });
  if (
    ["goal", "gauge"].includes(t.visual) &&
    (!t.goal || t.group_by !== "none" || (isMoneyMetric(t.metric) && !t.goal_currency))
  )
    ctx.addIssue({
      code: "custom",
      message: "Définissez un objectif, un total et une devise pour les montants.",
    });
  if (["kpi", "goal", "gauge"].includes(t.visual) && t.group_by !== "none")
    ctx.addIssue({ code: "custom", message: "Un indicateur ou objectif doit afficher un total." });
  if (
    ["line", "area", "combo"].includes(t.visual) &&
    !["day", "week", "month"].includes(t.group_by)
  )
    ctx.addIssue({ code: "custom", message: "Une courbe nécessite une dimension temporelle." });
  if (t.visual === "heatmap" && (t.group_by !== "day" || t.metric !== "count"))
    ctx.addIssue({ code: "custom", message: "La carte de chaleur affiche un nombre par jour." });
  if (isRecordVisual(t.visual) && t.metric !== "count")
    ctx.addIssue({
      code: "custom",
      message: "Une vue de fiches affiche des éléments, pas une mesure agrégée.",
    });
  if (isRecordVisual(t.visual) && t.visual !== "board" && t.group_by !== "none")
    ctx.addIssue({
      code: "custom",
      message: "Cette vue affiche des fiches individuelles sans regroupement.",
    });
  if (
    t.visual === "board" &&
    !(
      (t.kind === "record" && t.group_by === "stage") ||
      (["task", "commitment"].includes(t.kind) && t.group_by === "status")
    )
  )
    ctx.addIssue({
      code: "custom",
      message: "Le board regroupe les fiches par étape ou les tâches par statut.",
    });
  if (isContentVisual(t.visual) && (t.metric !== "count" || t.group_by !== "none"))
    ctx.addIssue({ code: "custom", message: "Un bloc de contenu ne calcule aucune mesure." });
  if (t.visual === "links" && !t.links?.length)
    ctx.addIssue({ code: "custom", message: "Ajoutez au moins un raccourci." });
});
export const dashboardSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).default(""),
    visibility: z.enum(["private", "workspace"]).default("private"),
    config: z
      .array(reportTile)
      .min(1)
      .max(24)
      .refine(
        (tiles) =>
          new Set(tiles.flatMap((t) => (t.id ? [t.id] : []))).size ===
          tiles.filter((t) => t.id).length,
        "Chaque indicateur doit avoir son propre identifiant.",
      )
      .refine(
        (tiles) => new TextEncoder().encode(JSON.stringify(tiles)).length < 35000,
        "Le dashboard contient trop de contenu ; raccourcissez vos notes.",
      ),
    settings: dashboardSettings.default({ period: "all", compare: true, refresh_seconds: 0 }),
  })
  .strict();
export type DashboardInput = z.infer<typeof dashboardSchema>;
export type DashboardSettings = z.infer<typeof dashboardSettings>;
export type DashboardRow = DashboardInput & {
  id: string;
  workspace_id: string;
  creator_id: string;
  version: number;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
};
export type DashboardDatum = {
  dimension: string | null;
  label: string;
  currency: string | null;
  count: number;
  value: string | null;
  sample_size: number;
};
export type DashboardAggregate = {
  data: DashboardDatum[];
  totals: DashboardDatum[];
  total: number;
  partial: boolean;
  missing_history: number;
  coverage: string;
};
export type DashboardTileResult = {
  tile: ReportTile;
  current?: DashboardAggregate;
  previous?: DashboardAggregate;
  error?: string;
  filter_note?: string;
  entries?: DashboardEntries;
};
export type DashboardEntry = {
  id: string;
  record_id: string | null;
  title: string;
  stage: string | null;
  status: string | null;
  occurred_at: string | null;
  currency: string | null;
  amount: string | null;
};
export type DashboardEntries = {
  data: DashboardEntry[];
  total: number;
  next_cursor: string | null;
  partial: boolean;
  month?: string;
};
export type DashboardResult = {
  name: string;
  tiles: DashboardTileResult[];
  generated_at: string;
  range: DateRange;
  settings: DashboardSettings;
};
export type DateRange = {
  since?: string;
  until?: string;
  previous?: { since: string; until: string };
  label: string;
};
export function resolveDashboardPeriod(s: DashboardSettings, now = new Date()): DateRange {
  if (s.period === "all") return { label: periodLabels.all };
  const day = 86400000,
    y = now.getUTCFullYear(),
    m = now.getUTCMonth();
  let start: Date, end: Date;
  if (s.period === "custom") {
    if (!s.since || !s.until) throw new Error("Période incomplète");
    start = new Date(s.since + "T00:00:00.000Z");
    end = new Date(Date.parse(s.until + "T00:00:00.000Z") + day);
  } else if (s.period === "last_month") {
    start = new Date(Date.UTC(y, m - 1, 1));
    end = new Date(Date.UTC(y, m, 1));
  } else {
    end = new Date(now.getTime() + 1);
    start =
      s.period === "this_month"
        ? new Date(Date.UTC(y, m, 1))
        : s.period === "quarter"
          ? new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1))
          : s.period === "year"
            ? new Date(Date.UTC(y, 0, 1))
            : new Date(now.getTime() - (s.period === "last_30" ? 30 : 90) * day);
  }
  const length = end.getTime() - start.getTime();
  return {
    since: start.toISOString(),
    until: end.toISOString(),
    ...(s.compare
      ? {
          previous: {
            since: new Date(start.getTime() - length).toISOString(),
            until: start.toISOString(),
          },
        }
      : {}),
    label: periodLabels[s.period] + " · UTC",
  };
}
export function tileFilters(
  tile: ReportTile,
  settings: DashboardSettings,
  range: Pick<DateRange, "since" | "until">,
) {
  const f: Record<string, string | boolean> = {};
  for (const key of [
    "object_id",
    "pipeline_id",
    "owner_id",
    "stage",
    "status",
    "since",
    "until",
    "overdue",
  ] as const) {
    const v = tile[key];
    if (v !== undefined) f[key] = v;
  }
  // Dashboard filters AND widget filters; conflicting scopes yield no results.
  if (settings.pipeline_id && tile.kind === "record") {
    if (f.pipeline_id && f.pipeline_id !== settings.pipeline_id) f.empty = true;
    else f.pipeline_id = settings.pipeline_id;
  }
  if (settings.owner_id && ["record", "task", "commitment"].includes(tile.kind)) {
    if (f.owner_id && f.owner_id !== settings.owner_id) f.empty = true;
    else f.owner_id = settings.owner_id;
  }
  if (settings.currency && tile.kind === "record") f.currency = settings.currency;
  if (tile.visual === "goal" && isMoneyMetric(tile.metric) && tile.goal_currency) {
    if (f.currency && f.currency !== tile.goal_currency) f.empty = true;
    f.currency = tile.goal_currency;
  }
  if (range.since && (!f.since || Date.parse(String(f.since)) < Date.parse(range.since)))
    f.since = range.since;
  if (range.until && (!f.until || Date.parse(String(f.until)) > Date.parse(range.until)))
    f.until = range.until;
  if (f.since && f.until && Date.parse(String(f.since)) >= Date.parse(String(f.until)))
    f.empty = true;
  if (tile.kind === "record" && tile.lifecycle !== "all") f.lifecycle = tile.lifecycle;
  return f;
}
export function defaultTile(patch: Partial<ReportTile> = {}): ReportTile {
  return {
    title: "Nouvel indicateur",
    description: "",
    kind: "record",
    group_by: "none",
    metric: "count",
    lifecycle: "all",
    date_field: "created",
    visual: "kpi",
    size: "small",
    color: "blue",
    ...patch,
  };
}
export function dashboardTemplate(
  template: "sales" | "activity" | "management",
  dealsId?: string,
): DashboardInput {
  const record = (patch: Partial<ReportTile>) =>
    defaultTile({ ...(dealsId ? { object_id: dealsId } : {}), ...patch });
  const sales = [
    record({ title: "Pipeline ouvert", metric: "amount", lifecycle: "open" }),
    record({
      title: "Prévision pondérée",
      metric: "weighted_amount",
      lifecycle: "open",
      color: "violet",
    }),
    record({
      title: "Ventes gagnées",
      metric: "amount",
      lifecycle: "won",
      date_field: "closed",
      color: "teal",
    }),
    record({ title: "Taux de gain", metric: "win_rate", date_field: "closed", color: "amber" }),
    record({
      title: "Répartition du pipeline",
      group_by: "stage",
      visual: "funnel",
      size: "medium",
      lifecycle: "open",
    }),
    record({
      title: "Ventes gagnées dans le temps",
      metric: "amount",
      lifecycle: "won",
      date_field: "closed",
      group_by: "month",
      visual: "area",
      size: "medium",
      color: "teal",
    }),
    record({
      title: "Montants par responsable",
      metric: "amount",
      lifecycle: "open",
      group_by: "owner",
      visual: "bars",
      size: "medium",
      color: "violet",
    }),
    record({
      title: "Ancienneté des étapes ouvertes",
      metric: "avg_stage_days",
      lifecycle: "open",
      group_by: "stage",
      visual: "columns",
      size: "medium",
      color: "amber",
    }),
  ];
  const activity = [
    defaultTile({ title: "Tâches", kind: "task" }),
    defaultTile({ title: "Tâches en retard", kind: "task", overdue: true, color: "rose" }),
    defaultTile({
      title: "Engagements réalisés",
      kind: "commitment",
      metric: "completion_rate",
      color: "teal",
    }),
    defaultTile({
      title: "Réunions importées",
      kind: "meeting",
      date_field: "occurred",
      color: "violet",
    }),
    defaultTile({
      title: "Charge par responsable",
      kind: "task",
      group_by: "owner",
      visual: "bars",
      size: "medium",
    }),
    defaultTile({
      title: "État des engagements",
      kind: "commitment",
      group_by: "status",
      visual: "donut",
      size: "medium",
      color: "teal",
    }),
    defaultTile({
      title: "Emails importés dans le temps",
      kind: "email",
      date_field: "occurred",
      group_by: "month",
      visual: "line",
      size: "large",
      color: "violet",
    }),
  ];
  const config =
    template === "sales"
      ? sales
      : template === "activity"
        ? activity
        : [
            sales[0],
            sales[2],
            activity[1],
            activity[2],
            sales[5],
            record({
              title: "Board des opportunités",
              visual: "board",
              group_by: "stage",
              size: "medium",
              lifecycle: "open",
            }),
            defaultTile({
              title: "À faire en priorité",
              kind: "task",
              visual: "list",
              overdue: true,
              date_field: "due",
              size: "third",
              color: "rose",
            }),
            defaultTile({
              title: "Agenda des réunions",
              kind: "meeting",
              visual: "calendar",
              date_field: "occurred",
              size: "third",
              color: "violet",
            }),
            defaultTile({ title: "Notes de l’équipe", visual: "text", size: "third", content: "" }),
          ];
  return {
    name:
      template === "sales"
        ? "Pilotage commercial"
        : template === "activity"
          ? "Activité de l’équipe"
          : "Vue d’ensemble",
    description:
      template === "sales"
        ? "Suivez le pipeline, les résultats et les points de blocage."
        : template === "activity"
          ? "Réunions, tâches et engagements : passez des échanges à la réalisation."
          : "Les indicateurs essentiels pour piloter votre CRM.",
    visibility: "private",
    config,
    settings: { period: "all", compare: true, refresh_seconds: 0 },
  };
}
export function moveTile<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items],
    [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
export function dashboardDelta(current: string | null, previous: string | null): number | null {
  if (
    current === null ||
    previous === null ||
    !Number.isFinite(Number(current)) ||
    !Number.isFinite(Number(previous)) ||
    Number(previous) === 0
  )
    return null;
  return ((Number(current) - Number(previous)) / Math.abs(Number(previous))) * 100;
}
export function dashboardCsv(result: DashboardResult): string {
  const cell = (v: unknown) =>
    '"' +
    (/^\s*[=+\-@]|^[\t\r\n]/.test(String(v ?? "")) ? "'" : "") +
    String(v ?? "").replaceAll('"', '""') +
    '"';
  const rows: unknown[][] = [
    [
      "Dashboard",
      "Indicateur",
      "Mesure",
      "Groupe",
      "Devise",
      "Valeur",
      "Nombre",
      "Échantillon",
      "Période",
      "Partiel",
      "Historique manquant",
    ],
  ];
  for (const r of result.tiles) {
    if (isContentVisual(r.tile.visual)) {
      rows.push([result.name, r.tile.title, "Contenu", r.tile.content ?? r.tile.description]);
      continue;
    }
    if (r.entries) {
      for (const entry of r.entries.data)
        rows.push([
          result.name,
          r.tile.title,
          "Fiche",
          entry.title,
          entry.currency,
          entry.amount,
          1,
          1,
          result.range.label,
          r.entries.partial,
          0,
        ]);
      continue;
    }
    if (!r.current) {
      rows.push([result.name, r.tile.title, r.tile.metric, r.error ?? "Erreur"]);
      continue;
    }
    for (const d of r.current.data)
      rows.push([
        result.name,
        r.tile.title,
        r.tile.metric,
        d.label,
        d.currency,
        d.value,
        d.count,
        d.sample_size,
        result.range.label,
        r.current.partial,
        r.current.missing_history,
      ]);
  }
  return "\uFEFF" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}

export function formatDashboardValue(
  value: string | null,
  metric: ReportTile["metric"],
  currency?: string | null,
): string {
  if (typeof value !== "string" || !/^-?\d+(\.\d+)?$/.test(value)) return "—";
  const negative = value.startsWith("-"),
    [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const decimals = metric === "count" || metric === "stage_reached" ? 0 : 2;
  const scale = 10n ** BigInt(decimals);
  let scaled = BigInt(whole) * scale + BigInt((fraction + "00").slice(0, decimals) || "0");
  if (Number(fraction[decimals] || "0") >= 5) scaled++;
  const integer = (scaled / scale).toLocaleString("fr-FR");
  const remainder = (scaled % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  const suffix = currency
    ? " " + currency
    : ["win_rate", "completion_rate"].includes(metric)
      ? " %"
      : metric.endsWith("_days")
        ? " j"
        : "";
  return (
    (negative && scaled !== 0n ? "−" : "") + integer + (remainder ? "," + remainder : "") + suffix
  );
}
