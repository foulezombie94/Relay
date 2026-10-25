"use client";
import { useState } from "react";
import {
  Hash,
  BarChart3,
  ChartColumn,
  ChartLine,
  ChartArea,
  ChartPie,
  Target,
  Gauge,
  Trophy,
  Radar,
  PanelsTopLeft,
  CalendarDays,
  Rows3,
  Kanban,
  LayoutGrid,
  ChartNoAxesCombined,
  Funnel,
  Table2,
  Type,
  Minus,
  Link2,
  Search,
  Plus,
  Activity,
  Clock3,
  type LucideIcon,
} from "lucide-react";
import { Modal } from "../ui";
import { dashboardVisuals, type ReportTile } from "@/lib/domain/dashboards";
import {
  widgetCatalog,
  widgetCategories,
  filterWidgetCatalog,
  type WidgetCategory,
  type WidgetPreset,
} from "@/lib/domain/dashboard-widgets";
import styles from "./dashboard.module.css";

export const widgetVisualIcons: Record<ReportTile["visual"], LucideIcon> = {
  kpi: Hash,
  bars: BarChart3,
  columns: ChartColumn,
  line: ChartLine,
  area: ChartArea,
  donut: ChartPie,
  pie: ChartPie,
  table: Table2,
  funnel: Funnel,
  goal: Target,
  ranking: Trophy,
  radar: Radar,
  treemap: PanelsTopLeft,
  heatmap: Activity,
  combo: ChartNoAxesCombined,
  gauge: Gauge,
  stat_grid: LayoutGrid,
  list: Rows3,
  board: Kanban,
  calendar: CalendarDays,
  timeline: Clock3,
  gallery: LayoutGrid,
  text: Type,
  divider: Minus,
  links: Link2,
};
export function WidgetIcon({ visual, size = 16 }: { visual: ReportTile["visual"]; size?: number }) {
  const Icon = widgetVisualIcons[visual];
  return <Icon size={size} aria-hidden="true" />;
}
export function WidgetIllustration({ visual }: { visual: ReportTile["visual"] }) {
  return (
    <div className={styles.illustration} data-visual={visual} aria-hidden="true">
      {["kpi", "goal", "gauge"].includes(visual) ? (
        <>
          <span className={styles.previewLabel} />
          <strong>
            42<span> +12%</span>
          </strong>
          {visual !== "kpi" && <div className={styles.previewProgress} />}
        </>
      ) : ["donut", "pie", "radar"].includes(visual) ? (
        <div className={styles.previewDonut} />
      ) : ["line", "area", "combo"].includes(visual) ? (
        <svg viewBox="0 0 180 66">
          <path
            d="M5 55 L28 42 L52 47 L78 27 L105 36 L130 17 L155 23 L175 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
          {visual !== "line" && (
            <path
              d="M5 55 L28 42 L52 47 L78 27 L105 36 L130 17 L155 23 L175 7 V66 H5Z"
              fill="currentColor"
              opacity=".1"
            />
          )}
        </svg>
      ) : ["columns", "bars", "funnel", "ranking"].includes(visual) ? (
        <div className={styles.previewBars}>
          {[45, 75, 55, 95, 65].map((height, i) => (
            <i key={i} style={{ height: height + "%" }} />
          ))}
        </div>
      ) : ["calendar", "heatmap", "treemap", "stat_grid", "gallery", "board"].includes(visual) ? (
        <div className={styles.previewCells}>
          {Array.from(
            { length: visual === "calendar" || visual === "heatmap" ? 21 : 6 },
            (_, i) => (
              <i key={i} />
            ),
          )}
        </div>
      ) : (
        <div className={styles.previewLines}>
          {[85, 65, 75].map((width, i) => (
            <i key={i} style={{ width: width + "%" }} />
          ))}
        </div>
      )}
    </div>
  );
}
export function WidgetLibrary({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (preset: WidgetPreset) => void;
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState<WidgetCategory>("all");
  const entries = filterWidgetCatalog(query, category);
  return (
    <Modal
      open
      onClose={onClose}
      title="Ajouter un widget"
      wide
      className={styles.libraryModal}
      description="Composez votre dashboard avec des vues CRM, des rapports et des blocs de contenu."
    >
      <div className={styles.librarySearch}>
        <Search size={17} />
        <input
          autoFocus
          aria-label="Rechercher un widget"
          placeholder="Rechercher un widget…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span>{dashboardVisuals.length} types</span>
      </div>
      <div className={styles.libraryLayout}>
        <nav className={styles.libraryCategories} aria-label="Catégories de widgets">
          {(Object.entries(widgetCategories) as [WidgetCategory, string][]).map(([id, label]) => (
            <button key={id} aria-pressed={category === id} onClick={() => setCategory(id)}>
              {label}
              <span>
                {id === "all"
                  ? widgetCatalog.length
                  : widgetCatalog.filter((p) => p.category === id).length}
              </span>
            </button>
          ))}
        </nav>
        <div className={styles.libraryResults}>
          <div className={styles.libraryCount}>
            {entries.length} widgets disponibles <span>Les aperçus sont des illustrations.</span>
          </div>
          <div className={styles.libraryGrid}>
            {entries.map((preset) => (
              <button
                key={preset.id}
                className={styles.libraryCard}
                onClick={() => onSelect(preset)}
              >
                <WidgetIllustration visual={preset.visual} />
                <div>
                  <WidgetIcon visual={preset.visual} />
                  <strong>{preset.name}</strong>
                  <Plus size={15} className={styles.libraryAdd} />
                </div>
                <p>{preset.description}</p>
              </button>
            ))}
          </div>
          {!entries.length && (
            <p className={styles.empty}>Aucun widget ne correspond à cette recherche.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
