import {
  defaultTile,
  isContentVisual,
  isRecordVisual,
  isMoneyMetric,
  type ReportTile,
  type DashboardEntry,
  type DashboardDatum,
} from "./dashboards";

export type WidgetCategory = "all" | "metrics" | "charts" | "views" | "content";
export type WidgetPreset = {
  id: string;
  name: string;
  description: string;
  category: Exclude<WidgetCategory, "all">;
  visual: ReportTile["visual"];
  patch?: Partial<ReportTile>;
  objectSlug?: string;
};
export const widgetCategories: Record<WidgetCategory, string> = {
  all: "Tous les widgets",
  metrics: "Indicateurs et objectifs",
  charts: "Graphiques et rapports",
  views: "Vues CRM",
  content: "Blocs et raccourcis",
};
export const widgetCatalog: WidgetPreset[] = [
  {
    id: "kpi",
    name: "Indicateur",
    description: "Un chiffre clé et sa comparaison avec la période précédente.",
    category: "metrics",
    visual: "kpi",
  },
  {
    id: "goal",
    name: "Objectif",
    description: "Suivez la progression vers un objectif chiffré.",
    category: "metrics",
    visual: "goal",
  },
  {
    id: "gauge",
    name: "Jauge",
    description: "Une progression circulaire avec une cible personnalisée.",
    category: "metrics",
    visual: "gauge",
  },
  {
    id: "stat_grid",
    name: "Cartes de répartition",
    description: "Les chiffres de chaque étape, statut ou responsable.",
    category: "metrics",
    visual: "stat_grid",
  },
  {
    id: "bars",
    name: "Barres horizontales",
    description: "Comparez vos équipes, étapes ou sources.",
    category: "charts",
    visual: "bars",
  },
  {
    id: "columns",
    name: "Colonnes",
    description: "Une comparaison verticale des valeurs par groupe.",
    category: "charts",
    visual: "columns",
  },
  {
    id: "line",
    name: "Courbe",
    description: "L’évolution de vos résultats dans le temps.",
    category: "charts",
    visual: "line",
  },
  {
    id: "area",
    name: "Aire",
    description: "Visualisez la tendance et son volume.",
    category: "charts",
    visual: "area",
  },
  {
    id: "donut",
    name: "Anneau",
    description: "La répartition des valeurs dans un graphique circulaire.",
    category: "charts",
    visual: "donut",
  },
  {
    id: "pie",
    name: "Camembert",
    description: "Comparez la contribution de chaque groupe au total.",
    category: "charts",
    visual: "pie",
  },
  {
    id: "funnel",
    name: "Pipeline / parcours",
    description: "Les étapes actuelles ou les passages réellement observés.",
    category: "charts",
    visual: "funnel",
  },
  {
    id: "ranking",
    name: "Classement",
    description: "Un classement décroissant des valeurs par groupe.",
    category: "charts",
    visual: "ranking",
  },
  {
    id: "radar",
    name: "Radar",
    description: "Comparez les valeurs de plusieurs groupes sur une même échelle.",
    category: "charts",
    visual: "radar",
  },
  {
    id: "treemap",
    name: "Carte proportionnelle",
    description: "La surface de chaque bloc représente sa valeur.",
    category: "charts",
    visual: "treemap",
  },
  {
    id: "heatmap",
    name: "Carte de chaleur",
    description: "Le volume d’activité par jour, en UTC.",
    category: "charts",
    visual: "heatmap",
  },
  {
    id: "combo",
    name: "Graphique combiné",
    description: "Une mesure et le nombre de fiches, avec deux axes distincts.",
    category: "charts",
    visual: "combo",
  },
  {
    id: "table",
    name: "Tableau de valeurs",
    description: "Les résultats exacts et les fiches derrière chaque valeur.",
    category: "views",
    visual: "table",
  },
  {
    id: "list",
    name: "Liste de fiches",
    description: "Un aperçu paginé de vos contacts, tâches ou réunions.",
    category: "views",
    visual: "list",
  },
  {
    id: "board",
    name: "Board Kanban",
    description: "Organisez les opportunités par étape ou les tâches par statut.",
    category: "views",
    visual: "board",
  },
  {
    id: "calendar",
    name: "Calendrier",
    description: "Vos réunions, échéances ou créations dans une grille mensuelle.",
    category: "views",
    visual: "calendar",
  },
  {
    id: "timeline",
    name: "Chronologie",
    description: "Vos fiches datées, regroupées dans un fil chronologique.",
    category: "views",
    visual: "timeline",
  },
  {
    id: "gallery",
    name: "Galerie de fiches",
    description: "Des cartes compactes pour parcourir les fiches CRM.",
    category: "views",
    visual: "gallery",
  },
  {
    id: "text",
    name: "Note et texte",
    description: "Ajoutez du contexte, une consigne ou les priorités de l’équipe.",
    category: "content",
    visual: "text",
  },
  {
    id: "divider",
    name: "Titre de section",
    description: "Structurez le dashboard avec un titre et une séparation.",
    category: "content",
    visual: "divider",
  },
  {
    id: "links",
    name: "Raccourcis",
    description: "Un accès direct aux pages utiles de votre espace Zyliad.",
    category: "content",
    visual: "links",
  },
  {
    id: "open_pipeline",
    name: "Valeur du pipeline",
    description: "Le montant des opportunités ouvertes, séparé par devise.",
    category: "metrics",
    visual: "kpi",
    objectSlug: "deals",
    patch: { title: "Pipeline ouvert", metric: "amount", lifecycle: "open", color: "blue" },
  },
  {
    id: "contacts",
    name: "Contacts",
    description: "Le nombre de personnes dans votre CRM.",
    category: "metrics",
    visual: "kpi",
    objectSlug: "people",
    patch: { title: "Contacts", color: "violet" },
  },
  {
    id: "companies",
    name: "Entreprises",
    description: "Le nombre de comptes clients et prospects.",
    category: "metrics",
    visual: "kpi",
    objectSlug: "companies",
    patch: { title: "Entreprises", color: "teal" },
  },
  {
    id: "overdue_tasks",
    name: "Tâches en retard",
    description: "Les échéances dépassées qui demandent votre attention.",
    category: "views",
    visual: "list",
    patch: {
      title: "À faire en priorité",
      kind: "task",
      overdue: true,
      date_field: "due",
      color: "rose",
    },
  },
  {
    id: "meetings",
    name: "Agenda des réunions",
    description: "Les réunions importées auxquelles vous avez accès.",
    category: "views",
    visual: "calendar",
    patch: {
      title: "Agenda des réunions",
      kind: "meeting",
      date_field: "occurred",
      color: "violet",
    },
  },
  {
    id: "task_board",
    name: "Board des tâches",
    description: "Vos tâches ouvertes, en cours et terminées.",
    category: "views",
    visual: "board",
    patch: { title: "Tâches de l’équipe", kind: "task", group_by: "status", color: "teal" },
  },
  {
    id: "mail_activity",
    name: "Activité email",
    description: "Le volume des emails importés, sans afficher leur contenu.",
    category: "charts",
    visual: "heatmap",
    patch: { title: "Activité email", kind: "email", date_field: "occurred", color: "violet" },
  },
];

/** Change presentation atomically so a new view never inherits an invalid metric/dimension. */
export function tileForVisual(initial: ReportTile, visual: ReportTile["visual"]): ReportTile {
  const next = { ...initial, visual };
  if (isContentVisual(visual) || isRecordVisual(visual)) {
    next.metric = "count";
    next.group_by = "none";
  }
  if (visual === "board") {
    if (!["record", "task", "commitment"].includes(next.kind)) {
      return tileForVisual(
        defaultTile({ id: next.id, title: next.title, size: next.size, color: next.color }),
        visual,
      );
    }
    next.group_by = next.kind === "record" ? "stage" : "status";
  } else if (["kpi", "goal", "gauge"].includes(visual)) {
    next.group_by = "none";
  } else if (["line", "area", "combo"].includes(visual)) {
    next.group_by = ["day", "week", "month"].includes(next.group_by) ? next.group_by : "month";
  } else if (visual === "heatmap") {
    next.metric = "count";
    next.group_by = "day";
  } else if (
    !isRecordVisual(visual) &&
    !isContentVisual(visual) &&
    next.group_by === "none" &&
    visual !== "table"
  ) {
    next.group_by =
      next.kind === "record"
        ? "stage"
        : ["task", "commitment"].includes(next.kind)
          ? "status"
          : "provider";
  }
  if (["goal", "gauge"].includes(visual)) {
    next.goal = next.goal ?? 100;
    if (isMoneyMetric(next.metric)) next.goal_currency = next.goal_currency ?? "EUR";
  }
  if (visual === "divider") next.size = "large";
  if (visual === "text") next.content = next.content ?? "";
  if (visual === "links")
    next.links = next.links?.length
      ? next.links
      : [
          { label: "Contacts", href: "/app/people" },
          { label: "Opportunités", href: "/app/deals" },
          { label: "Tâches", href: "/app/tasks" },
        ];
  return next;
}
export function tileFromPreset(preset: WidgetPreset, objects: { id: string; slug: string }[]) {
  const object = objects.find((o) => o.slug === (preset.objectSlug ?? "deals"));
  const tile = tileForVisual(
    defaultTile({
      title: preset.name,
      size: preset.category === "metrics" ? "small" : "medium",
      ...(object ? { object_id: object.id } : {}),
      ...preset.patch,
    }),
    preset.visual,
  );
  // Non-record sources must not retain the default CRM object filter.
  if (tile.kind !== "record") delete tile.object_id;
  return tile;
}
export function filterWidgetCatalog(query: string, category: WidgetCategory) {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr");
  const search = normalize(query.trim());
  return widgetCatalog.filter(
    (item) =>
      (category === "all" || item.category === category) &&
      normalize(item.name + " " + item.description).includes(search),
  );
}
export function entryDate(entry: DashboardEntry) {
  if (!entry.occurred_at) return null;
  const time = Date.parse(entry.occurred_at);
  return Number.isFinite(time) ? new Date(time) : null;
}
export function calendarCells(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const length = Math.ceil((offset + days) / 7) * 7;
  return Array.from({ length }, (_, i) => new Date(Date.UTC(year, month, 1 - offset + i)));
}
export const tileWidths: ReportTile["size"][] = ["small", "third", "medium", "large"];
/** Recharts Treemap overwrites payload.value with a number: preserve the exact SQL decimal. */
export function chartTooltipValue(rows: DashboardDatum[], payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const item = payload as Record<string, unknown>;
  const original = rows.find(
    (row) =>
      row.dimension === item.dimension && (row.label === item.label || row.label === item.name),
  );
  return original?.value ?? (typeof item.value === "string" ? item.value : null);
}
