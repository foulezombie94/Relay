"use client";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import Link from "next/link";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Star,
  House,
  Copy,
  Download,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  GripVertical,
  Trash2,
  Printer,
  LayoutDashboard,
  Filter,
  MoreHorizontal,
  Check,
  Share2,
  Presentation,
} from "lucide-react";
import { useWorkspace, useRows, useSave, request } from "../providers/data-provider";
import { Modal, ErrorMessage, Loading, str } from "../ui";
import {
  dashboardSchema,
  dashboardSettings,
  dashboardTemplate,
  dashboardPeriods,
  periodLabels,
  defaultTile,
  moveTile,
  dashboardCsv,
  type DashboardRow,
  type DashboardInput,
  type DashboardSettings,
  type DashboardResult,
  type ReportTile,
  type DashboardDatum,
  type DashboardEntries,
  type DashboardEntry,
} from "@/lib/domain/dashboards";
import { tileFromPreset } from "@/lib/domain/dashboard-widgets";
import { DashboardWidget } from "./widget";
import { DashboardHeader, DashboardEditNotice, matchesWidgetSearch } from "./dashboard-header";
import { SlideViewer } from "../ui/slide-viewer";
import { WidgetEditor } from "./editor";
import { WidgetLibrary } from "./widget-library";
import { WidgetMenu, WidgetResize } from "./widget-menu";
import styles from "./dashboard.module.css";
import boardStyles from "./board.module.css";
type Preference = { dashboard_id: string; favorite: boolean; home: boolean };
type Detail = {
  data: {
    id: string;
    record_id: string | null;
    title: string;
    stage: string | null;
    status: string | null;
    amount: string | null;
    currency: string | null;
  }[];
  total: number;
  next_cursor: string | null;
  partial: boolean;
};
export function DashboardPage() {
  const { workspace } = useWorkspace();
  return <DashboardWorkspace key={workspace.id} />;
}
function DashboardWorkspace() {
  const { workspace, user, objects } = useWorkspace(),
    cache = useQueryClient(),
    { save, remove, busy } = useSave();
  const dashboards = useRows<DashboardRow>("report_dashboards", { size: 100 }),
    pipelines = useRows("pipelines", { size: 100 }),
    members = useRows("memberships", { size: 100 });
  const endpoint = "/api/" + workspace.id + "/reports/dashboard";
  const preferences = useQuery({
    queryKey: ["rows", workspace.id, "dashboard-preferences"],
    queryFn: () => request<{ data: Preference[] }>(endpoint + "/preferences"),
  });
  const [selected, setSelected] = useState<string | null>(() => {
      if (typeof window === "undefined") return null;
      const params = new URLSearchParams(window.location.search);
      return params.get("workspace") === workspace.id ? params.get("dashboard") : null;
    }),
    [template, setTemplate] = useState<"management" | "sales" | "activity">("management");
  const [draft, setDraft] = useState<DashboardInput | null>(null),
    [override, setOverride] = useState<DashboardSettings | null>(null),
    [editor, setEditor] = useState<{ index: number; tile: ReportTile } | null>(null);
  const [library, setLibrary] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [deleteOpen, setDeleteOpen] = useState(false);
  const [widgetSearch, setWidgetSearch] = useState("");
  const [widgetLibrary, setWidgetLibrary] = useState(false),
    [filtersOpen, setFiltersOpen] = useState(false),
    [fullscreen, setFullscreen] = useState<number | null>(null),
    [entryDetail, setEntryDetail] = useState<{ entry: DashboardEntry; tile: ReportTile } | null>(
      null,
    );
  const [drag, setDrag] = useState<number | null>(null),
    [actionError, setActionError] = useState<Error | null>(null),
    [exportBusy, setExportBusy] = useState(false);
  const [detail, setDetail] = useState<{
    index: number;
    dimension: string | null;
    currency: string | null;
    cursor: string | null;
  } | null>(null);
  const home = preferences.data?.data.find((p) => p.home)?.dashboard_id;
  const selectedId =
    selected ?? (dashboards.data?.data.some((d) => d.id === home) ? (home ?? "") : "");
  const row = dashboards.data?.data.find((d) => d.id === selectedId);
  const parsed = row
    ? dashboardSchema.safeParse({
        name: row.name,
        description: row.description,
        visibility: row.visibility,
        config: row.config,
        settings: row.settings,
      })
    : null;
  const baseline = parsed?.success
    ? parsed.data
    : dashboardTemplate(template, objects.find((o) => o.slug === "deals")?.id);
  const config = draft ?? baseline,
    filters = override ?? config.settings;
  const writable = workspace.role !== "viewer",
    canEdit =
      writable &&
      (!row || row.creator_id === user.id || ["owner", "admin"].includes(workspace.role));
  const ready = !dashboards.isPending && !preferences.isPending;
  const canReadConfiguration = ready && (!selectedId || !!row) && (!parsed || parsed.success);
  const results = useQuery({
    queryKey: ["rows", workspace.id, "dashboard-results", selectedId, template, draft, filters],
    enabled: canReadConfiguration,
    queryFn: () =>
      draft
        ? request<{ data: DashboardResult }>(endpoint, "POST", {
            dashboard: draft,
            settings: filters,
          })
        : request<{ data: DashboardResult }>(
            endpoint +
              "?" +
              new URLSearchParams({
                ...(selectedId ? { id: selectedId } : { template }),
                settings: JSON.stringify(filters),
              }),
          ),
    refetchOnWindowFocus: true,
    refetchInterval: filters.refresh_seconds ? filters.refresh_seconds * 1000 : false,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const details = useQuery({
    queryKey: ["rows", workspace.id, "dashboard-details", selectedId, draft, filters, detail],
    enabled: !!detail && canReadConfiguration && !results.isError,
    queryFn: () =>
      request<{ data: Detail }>(endpoint, "POST", { dashboard: config, settings: filters, detail }),
    retry: false,
  });
  const pref = preferences.data?.data.find((p) => p.dashboard_id === selectedId);
  async function perform(fn: () => Promise<unknown>) {
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(e instanceof Error ? e : new Error("Action impossible"));
    }
  }
  function beginEdit() {
    setDraft({
      ...baseline,
      settings: filters,
      config: baseline.config.map((t) => ({ ...t, id: t.id ?? crypto.randomUUID() })),
    });
  }
  function changeFilters(patch: Partial<DashboardSettings>) {
    const next = { ...filters, ...patch };
    setOverride(next);
  }
  function switchTo(id: string) {
    setSelected(id);
    setDraft(null);
    setOverride(null);
    setDetail(null);
    setActionError(null);
    setFullscreen(null);
    setEntryDetail(null);
    const url = new URL(window.location.href);
    url.searchParams.set("workspace", workspace.id);
    if (id) url.searchParams.set("dashboard", id);
    else url.searchParams.delete("dashboard");
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
  }
  async function preference(operation: "home" | "favorite", enabled: boolean) {
    await request(endpoint + "/preferences", "POST", {
      dashboard_id: selectedId,
      operation,
      enabled,
    });
    await cache.invalidateQueries({ queryKey: ["rows", workspace.id, "dashboard-preferences"] });
  }
  const sorted = [...(dashboards.data?.data ?? [])].sort(
    (a, b) =>
      Number(preferences.data?.data.some((p) => p.dashboard_id === b.id && p.favorite)) -
        Number(preferences.data?.data.some((p) => p.dashboard_id === a.id && p.favorite)) ||
      a.name.localeCompare(b.name),
  );
  function patchTile(index: number, patch: Partial<ReportTile>) {
    if (draft)
      setDraft({
        ...draft,
        config: draft.config.map((tile, i) => (i === index ? { ...tile, ...patch } : tile)),
      });
  }
  function editTile(index: number) {
    if (!canEdit) return;
    if (!draft) beginEdit();
    setEditor({
      index,
      tile: { ...config.config[index], id: config.config[index].id ?? crypto.randomUUID() },
    });
  }
  function entryPage(index: number) {
    return async (options: { cursor: string | null; month?: string }) =>
      (
        await request<{ data: DashboardEntries }>(endpoint, "POST", {
          dashboard: config,
          settings: filters,
          detail: { index, dimension: null, currency: null, ...options },
        })
      ).data;
  }
  function showDetails(index: number, datum: DashboardDatum | null) {
    setFullscreen(null);
    setDetail({
      index,
      dimension: config.config[index].group_by === "none" ? null : (datum?.dimension ?? null),
      currency: datum?.currency ?? null,
      cursor: null,
    });
  }
  async function copyLink() {
    const url = new URL("/app/dashboard", window.location.origin);
    url.searchParams.set("workspace", workspace.id);
    url.searchParams.set("dashboard", selectedId);
    await navigator.clipboard.writeText(url.toString());
    toast.success("Lien copié — l’accès reste soumis aux permissions de l’espace.");
  }
  return (
    <main
      className={`${styles.page} ${boardStyles.canvas}`}
      data-relay-dashboard
      data-editing={!!draft}
    >
      {filters.cover && filters.cover !== "none" && (
        <div className={styles.cover} data-cover={filters.cover} aria-hidden="true" />
      )}
      <DashboardHeader
        editing={!!draft}
        title={selectedId || draft ? config.name : "Tableau de bord"}
        search={widgetSearch}
        onSearch={setWidgetSearch}
      >
        <div className={styles.actions}>
          {canEdit && (
            <button
              className="button"
              disabled={!canReadConfiguration || config.config.length >= 24}
              onClick={() => {
                if (!draft) beginEdit();
                setWidgetLibrary(true);
              }}
            >
              <Plus size={15} /> Ajouter un widget
            </button>
          )}
          <Popover.Root>
            <Popover.Trigger className="icon-button" aria-label="Options du tableau de bord">
              <MoreHorizontal size={18} />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content className={boardStyles.boardOptions} align="end" sideOffset={8}>
                <strong>Tableau de bord</strong>
                <p>{config.description}</p>
                <small>
                  {config.visibility === "workspace" ? "Partagé avec l’espace" : "Privé"}
                </small>
                <button
                  className="button"
                  disabled={
                    !canReadConfiguration || results.isError || !results.data?.data.tiles.length
                  }
                  onClick={() => setFullscreen(0)}
                >
                  <Presentation size={15} />
                  Présenter
                </button>
                {canEdit && (
                  <button
                    className="button"
                    onClick={() => {
                      if (!draft) beginEdit();
                      setSettingsOpen(true);
                    }}
                  >
                    <Share2 size={14} />
                    Partager
                  </button>
                )}
                <button className="button" onClick={() => setLibrary(true)} disabled={!writable}>
                  <Plus size={15} /> Nouveau tableau de bord
                </button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          {!draft && canEdit && (
            <button className="button" onClick={beginEdit}>
              <Pencil size={15} /> Personnaliser
            </button>
          )}
          {draft && (
            <>
              <button
                className="button"
                onClick={() => {
                  setDraft(null);
                  setEditor(null);
                }}
              >
                Annuler
              </button>
              <button
                className="button primary"
                disabled={busy || !canEdit}
                onClick={() =>
                  perform(async () => {
                    const payload = dashboardSchema.parse({ ...draft, settings: filters });
                    const saved = await save("report_dashboards", payload, row);
                    switchTo(saved.id);
                    toast.success("Tableau de bord enregistré.");
                  })
                }
              >
                <Check size={15} /> Enregistrer
              </button>
            </>
          )}
        </div>
      </DashboardHeader>
      <div className={styles.viewTabs} role="group" aria-label="Vues du dashboard">
        {(
          [
            ["management", "Vue d’ensemble"],
            ["sales", "Commercial"],
            ["activity", "Activité"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            aria-pressed={!selectedId && template === value}
            disabled={!!draft}
            onClick={() => {
              switchTo("");
              setTemplate(value);
            }}
          >
            <LayoutDashboard size={14} />
            {label}
          </button>
        ))}
        {selectedId && (
          <button aria-pressed="true" disabled>
            {row?.name}
          </button>
        )}
        <span className={styles.spacer} />
        <span className={styles.viewMode}>{draft ? "Modification" : "Affichage"}</span>
      </div>
      <details className={boardStyles.boardTools}>
        <summary>Tableaux enregistrés et options</summary>
        <div className={styles.toolbar}>
          <select
            aria-label="Dashboard"
            value={selectedId}
            onChange={(e) => switchTo(e.target.value)}
            disabled={!!draft}
          >
            <option value="">
              Vue personnelle ·{" "}
              {template === "sales"
                ? "Commercial"
                : template === "activity"
                  ? "Activité"
                  : "Vue d’ensemble"}
            </option>
            {sorted.map((d) => (
              <option key={d.id} value={d.id}>
                {preferences.data?.data.some((p) => p.dashboard_id === d.id && p.favorite)
                  ? "★ "
                  : ""}
                {d.name}
                {d.visibility === "workspace" ? " · partagé" : " · privé"}
              </option>
            ))}
          </select>
          {selectedId && !draft && (
            <>
              <button
                title={pref?.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                aria-label={pref?.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                aria-pressed={!!pref?.favorite}
                className="icon-button"
                onClick={() => perform(() => preference("favorite", !pref?.favorite))}
              >
                <Star size={17} fill={pref?.favorite ? "#cf921c" : "none"} />
              </button>
              <button
                title="Dashboard par défaut"
                aria-label="Dashboard par défaut"
                aria-pressed={!!pref?.home}
                className="icon-button"
                onClick={() => perform(() => preference("home", !pref?.home))}
              >
                <House size={17} fill={pref?.home ? "#dce5ff" : "none"} />
              </button>
            </>
          )}
          <span className={styles.spacer} />
          {writable && !draft && (
            <button
              className="button"
              onClick={() => {
                setSelected("");
                setDraft({
                  ...config,
                  name: config.name + " · copie",
                  visibility: "private",
                  config: config.config.map((t) => ({ ...t, id: crypto.randomUUID() })),
                });
              }}
            >
              <Copy size={14} /> Dupliquer
            </button>
          )}
          {draft && (
            <button className="button" onClick={() => setSettingsOpen(true)}>
              Nom et partage
            </button>
          )}
          {selectedId && canEdit && !draft && (
            <button
              aria-label="Supprimer le dashboard"
              className="icon-button"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            className="button"
            disabled={results.isFetching}
            onClick={() => void results.refetch()}
          >
            <RefreshCw size={14} /> Actualiser
          </button>
          <button
            className="button"
            disabled={exportBusy || !canReadConfiguration}
            onClick={() =>
              perform(async () => {
                setExportBusy(true);
                try {
                  const fresh = await request<{ data: DashboardResult }>(endpoint, "POST", {
                    dashboard: config,
                    settings: filters,
                  });
                  if (fresh.data.tiles.some((t) => t.error))
                    throw new Error("Corrigez les indicateurs en erreur avant l’export.");
                  const url = URL.createObjectURL(
                    new Blob([dashboardCsv(fresh.data)], { type: "text/csv;charset=utf-8" }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "zyliad-dashboard.csv";
                  a.click();
                  URL.revokeObjectURL(url);
                } finally {
                  setExportBusy(false);
                }
              })
            }
          >
            <Download size={14} /> CSV
          </button>
          <button
            className="icon-button"
            aria-label="Imprimer le dashboard"
            disabled={results.isFetching}
            onClick={() =>
              perform(async () => {
                const fresh = await results.refetch();
                if (fresh.error || fresh.data?.data.tiles.some((t) => t.error))
                  throw new Error("Actualisation nécessaire avant impression.");
                window.print();
              })
            }
          >
            <Printer size={16} />
          </button>
        </div>
      </details>
      <div className={styles.filterSummary}>
        <button
          className="button small"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <Filter size={14} />
          Filtres
          {(filters.pipeline_id || filters.owner_id || filters.currency) && (
            <span className={styles.filterDot} />
          )}
        </button>
        <span>
          {periodLabels[filters.period]}
          {filters.compare && filters.period !== "all" ? " · comparaison active" : ""}
        </span>
        <span className={styles.spacer} />
        {draft && (
          <button
            className="button primary small"
            disabled={draft.config.length >= 24}
            onClick={() => setWidgetLibrary(true)}
          >
            <Plus size={14} />
            Ajouter un widget
          </button>
        )}
        <small>{config.config.length}/24 widgets</small>
      </div>
      <div className={styles.filters} hidden={!filtersOpen}>
        <label>
          Période
          <select
            value={filters.period}
            onChange={(e) => {
              if (e.target.value === "custom") {
                const today = new Date().toISOString().slice(0, 10);
                changeFilters({
                  period: "custom",
                  since: filters.since ?? today,
                  until: filters.until ?? today,
                });
              } else changeFilters({ period: e.target.value as DashboardSettings["period"] });
            }}
          >
            {dashboardPeriods.map((p) => (
              <option value={p} key={p}>
                {periodLabels[p]}
              </option>
            ))}
          </select>
        </label>
        {filters.period === "custom" && (
          <>
            <label>
              Du
              <input
                type="date"
                value={filters.since ?? ""}
                onChange={(e) => changeFilters({ since: e.target.value })}
              />
            </label>
            <label>
              Au (inclus)
              <input
                type="date"
                value={filters.until ?? ""}
                onChange={(e) => changeFilters({ until: e.target.value })}
              />
            </label>
          </>
        )}
        <label>
          Pipeline
          <select
            value={filters.pipeline_id ?? ""}
            onChange={(e) => changeFilters({ pipeline_id: e.target.value || undefined })}
          >
            <option value="">Tous les pipelines</option>
            {pipelines.data?.data.map((p) => (
              <option key={p.id} value={p.id}>
                {str(p.name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Responsable
          <select
            value={filters.owner_id ?? ""}
            onChange={(e) => changeFilters({ owner_id: e.target.value || undefined })}
          >
            <option value="">Toute l’équipe</option>
            {members.data?.data.map((m) => (
              <option key={m.id} value={str(m.user_id)}>
                {str(m.display_name) || str(m.user_id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Devise
          <select
            value={filters.currency ?? ""}
            onChange={(e) => changeFilters({ currency: e.target.value || undefined })}
          >
            <option value="">Toutes, séparément</option>
            {Array.from(new Set([workspace.currency, "EUR", "USD", "GBP", "CHF", "CAD"])).map(
              (c) => (
                <option key={c}>{c}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Actualisation
          <select
            value={filters.refresh_seconds}
            onChange={(e) =>
              changeFilters({ refresh_seconds: Number(e.target.value) as 0 | 60 | 300 })
            }
          >
            <option value="0">Manuelle</option>
            <option value="60">Chaque minute</option>
            <option value="300">Toutes les 5 minutes</option>
          </select>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={filters.compare}
            onChange={(e) => changeFilters({ compare: e.target.checked })}
          />{" "}
          Comparer
        </label>
        {override && (
          <button className={styles.textButton} onClick={() => setOverride(null)}>
            Réinitialiser
          </button>
        )}
      </div>
      <ErrorMessage
        error={
          actionError ||
          dashboards.error ||
          preferences.error ||
          results.error ||
          (parsed && !parsed.success
            ? new Error("Configuration invalide : dupliquez ou recréez ce dashboard.")
            : ready && selectedId && !row
              ? new Error("Ce dashboard est inaccessible dans cet espace.")
              : null)
        }
      />
      {results.isFetching && (
        <p role="status" className={styles.muted}>
          Actualisation des données autorisées…
        </p>
      )}
      {!ready && <Loading />}
      {draft && (
        <DashboardEditNotice>
          <button
            className="button"
            disabled={draft.config.length >= 24}
            onClick={() => setWidgetLibrary(true)}
          >
            <Plus size={15} /> Bibliothèque de widgets
          </button>
        </DashboardEditNotice>
      )}
      {canReadConfiguration && !results.isError && results.data && (
        <div className={`${styles.grid} ${boardStyles.grid}`}>
          {results.data.data.tiles.map((result, i) => (
            <section
              key={result.tile.id ?? i}
              className={styles.slot}
              hidden={!matchesWidgetSearch(result.tile.title, widgetSearch)}
              data-size={result.tile.size}
              onDragOver={(e) => {
                if (draft) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draft && drag !== null)
                  setDraft({ ...draft, config: moveTile(draft.config, drag, i) });
                setDrag(null);
              }}
            >
              {draft && (
                <div className={styles.editBar}>
                  <button
                    draggable
                    className="icon-button"
                    aria-label="Déplacer l’indicateur"
                    onDragStart={() => setDrag(i)}
                    onDragEnd={() => setDrag(null)}
                  >
                    <GripVertical size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Déplacer avant"
                    disabled={i === 0}
                    onClick={() => setDraft({ ...draft, config: moveTile(draft.config, i, i - 1) })}
                  >
                    <ArrowLeft size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Déplacer après"
                    disabled={i === draft.config.length - 1}
                    onClick={() => setDraft({ ...draft, config: moveTile(draft.config, i, i + 1) })}
                  >
                    <ArrowRight size={15} />
                  </button>
                  <select
                    aria-label="Largeur de la carte"
                    value={result.tile.size}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        config: draft.config.map((t, n) =>
                          n === i ? { ...t, size: e.target.value as ReportTile["size"] } : t,
                        ),
                      })
                    }
                  >
                    <option value="small">¼</option>
                    <option value="third">⅓</option>
                    <option value="medium">½</option>
                    <option value="large">1</option>
                  </select>
                  <button
                    className="icon-button"
                    aria-label="Configurer l’indicateur"
                    onClick={() => setEditor({ index: i, tile: draft.config[i] })}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Retirer l’indicateur"
                    disabled={draft.config.length === 1}
                    onClick={() =>
                      setDraft({ ...draft, config: draft.config.filter((_, n) => n !== i) })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
              <DashboardWidget
                result={result}
                onDetails={(d) => showDetails(i, d)}
                generation={results.data.data.generated_at}
                onEntry={(entry) => setEntryDetail({ entry, tile: result.tile })}
                onEntryPage={entryPage(i)}
                actions={
                  <>
                    <button
                      className="icon-button"
                      aria-label={"Actualiser " + result.tile.title}
                      disabled={results.isFetching}
                      onClick={() => void results.refetch()}
                    >
                      <RefreshCw size={14} />
                    </button>
                    <WidgetMenu
                      editing={!!draft}
                      canEdit={canEdit}
                      canDuplicate={config.config.length < 24}
                      canRemove={config.config.length > 1}
                      first={i === 0}
                      last={i === config.config.length - 1}
                      onEdit={() => editTile(i)}
                      onExpand={() => setFullscreen(i)}
                      onDuplicate={() =>
                        draft &&
                        setDraft({
                          ...draft,
                          config: [
                            ...draft.config.slice(0, i + 1),
                            {
                              ...draft.config[i],
                              id: crypto.randomUUID(),
                              title: draft.config[i].title.slice(0, 92) + " · copie",
                            },
                            ...draft.config.slice(i + 1),
                          ],
                        })
                      }
                      onRemove={() =>
                        draft &&
                        setDraft({
                          ...draft,
                          config: draft.config.filter((_, index) => index !== i),
                        })
                      }
                      onMove={(amount) =>
                        draft &&
                        setDraft({ ...draft, config: moveTile(draft.config, i, i + amount) })
                      }
                    />
                  </>
                }
              />
              {draft && (
                <WidgetResize tile={result.tile} onChange={(patch) => patchTile(i, patch)} />
              )}
            </section>
          ))}
          {results.data.data.tiles.every(
            (result) => !matchesWidgetSearch(result.tile.title, widgetSearch),
          ) && (
            <p className={boardStyles.searchEmpty}>
              Aucun widget ne correspond à « {widgetSearch} ».
            </p>
          )}
        </div>
      )}
      {widgetLibrary && draft && (
        <WidgetLibrary
          onClose={() => setWidgetLibrary(false)}
          onSelect={(preset) => {
            setEditor({
              index: draft.config.length,
              tile: { ...tileFromPreset(preset, objects), id: crypto.randomUUID() },
            });
            setWidgetLibrary(false);
          }}
        />
      )}
      {canReadConfiguration && !results.isError && results.data && (
        <p className={styles.footnote}>
          Mis à jour le {new Date(results.data.data.generated_at).toLocaleString("fr-FR")} ·{" "}
          {results.data.data.range.label}. Les filtres portent sur la date choisie pour chaque
          indicateur. Le pipeline représente les états actuels ; les prévisions sont des hypothèses.
          Emails et réunions : données importées accessibles uniquement.
        </p>
      )}
      {editor && draft && (
        <WidgetEditor
          key={editor.tile.id ?? editor.index}
          initial={editor.tile}
          onClose={() => setEditor(null)}
          onSave={(tile) => {
            setDraft({
              ...draft,
              config:
                editor.index === draft.config.length
                  ? [...draft.config, tile]
                  : draft.config.map((t, i) => (i === editor.index ? tile : t)),
            });
            setEditor(null);
          }}
        />
      )}
      <Modal
        open={library}
        onClose={() => setLibrary(false)}
        title="Créer un dashboard"
        description="Choisissez un point de départ, puis adaptez chaque carte à vos besoins."
      >
        <div className={styles.templates}>
          <button
            onClick={() => {
              switchTo("");
              setDraft({
                name: "Mon dashboard",
                description: "",
                visibility: "private",
                config: [
                  defaultTile({
                    id: crypto.randomUUID(),
                    title: "Notes",
                    visual: "text",
                    size: "large",
                    content: "",
                  }),
                ],
                settings: { period: "all", compare: true, refresh_seconds: 0 },
              });
              setLibrary(false);
            }}
          >
            <strong>À partir de zéro</strong>
            <span>Une page libre à composer avec vos widgets et vos vues CRM.</span>
            <small>Privé par défaut</small>
          </button>
          {(["management", "sales", "activity"] as const).map((t) => {
            const preset = dashboardTemplate(t, objects.find((o) => o.slug === "deals")?.id);
            return (
              <button
                key={t}
                onClick={() => {
                  setTemplate(t);
                  setSelected("");
                  setOverride(null);
                  setDraft({
                    ...preset,
                    config: preset.config.map((tile) => ({ ...tile, id: crypto.randomUUID() })),
                  });
                  setLibrary(false);
                }}
              >
                <strong>{preset.name}</strong>
                <span>{preset.description}</span>
                <small>{preset.config.length} widgets · privé par défaut</small>
              </button>
            );
          })}
        </div>
      </Modal>
      {draft && (
        <Modal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          title="Nom et partage"
          description="Partager la configuration ne donne aucun accès supplémentaire aux données CRM."
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (dashboardSettings.safeParse(filters).success) setSettingsOpen(false);
            }}
          >
            <label>
              Nom
              <input
                required
                maxLength={120}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              Description
              <textarea
                maxLength={1000}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
            <label>
              Visibilité
              <select
                value={draft.visibility}
                onChange={(e) =>
                  setDraft({ ...draft, visibility: e.target.value as DashboardInput["visibility"] })
                }
              >
                <option value="private">Moi uniquement</option>
                <option value="workspace">Membres de cet espace</option>
              </select>
            </label>
            <label>
              Couverture
              <select
                value={filters.cover ?? "none"}
                onChange={(e) =>
                  changeFilters({ cover: e.target.value as DashboardSettings["cover"] })
                }
              >
                <option value="none">Sans couverture</option>
                <option value="slate">Gris doux</option>
                <option value="lavender">Lavande</option>
                <option value="blue">Bleu</option>
              </select>
            </label>
            <p>
              Les membres consultent les résultats selon leurs permissions actuelles. Le partage
              reste interne à l’espace.
            </p>
            {selectedId && (
              <button type="button" className="button" onClick={() => void perform(copyLink)}>
                <Copy size={14} />
                Copier le lien interne
              </button>
            )}
            <button className="button primary">Appliquer</button>
          </form>
        </Modal>
      )}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Supprimer ce dashboard ?"
        description="Cette action supprime sa configuration et ses préférences, sans supprimer les données CRM."
      >
        <div className={styles.actions}>
          <button className="button" onClick={() => setDeleteOpen(false)}>
            Annuler
          </button>
          <button
            className="button primary"
            onClick={() =>
              perform(async () => {
                await remove("report_dashboards", selectedId);
                switchTo("");
                setDeleteOpen(false);
              })
            }
          >
            Supprimer
          </button>
        </div>
      </Modal>
      <SlideViewer
        open={fullscreen !== null}
        index={fullscreen ?? 0}
        onIndexChange={setFullscreen}
        onClose={() => setFullscreen(null)}
        label={config.name}
        slides={
          canReadConfiguration && !results.isError && results.data
            ? results.data.data.tiles.map((result, index) => ({
                id: result.tile.id ?? String(index),
                title: result.tile.title,
                description: result.tile.description,
                content: (
                  <DashboardWidget
                    result={result}
                    onDetails={(datum) => {
                      setFullscreen(null);
                      showDetails(index, datum);
                    }}
                    onEntry={(entry) => {
                      setFullscreen(null);
                      setEntryDetail({ entry, tile: result.tile });
                    }}
                    onEntryPage={entryPage(index)}
                    generation={results.data.data.generated_at}
                  />
                ),
              }))
            : []
        }
      />
      <Modal
        open={!!entryDetail}
        onClose={() => setEntryDetail(null)}
        title="Fiche source"
        description="Un aperçu de la fiche autorisée dans votre espace."
      >
        <ErrorMessage error={results.error} />
        {canReadConfiguration && !results.isError && entryDetail && (
          <div className={styles.entryDetail}>
            <h2>{entryDetail.entry.title}</h2>
            <p>{entryDetail.entry.stage ?? entryDetail.entry.status ?? "—"}</p>
            <p>
              {entryDetail.entry.occurred_at
                ? new Date(entryDetail.entry.occurred_at).toLocaleString("fr-FR", {
                    timeZone: "UTC",
                  }) + " · UTC"
                : "Sans date"}
            </p>
            {entryDetail.entry.currency && (
              <p>
                {entryDetail.entry.amount} {entryDetail.entry.currency}
              </p>
            )}
            {entryDetail.tile.kind === "record" &&
              entryDetail.tile.object_id &&
              (() => {
                const object = objects.find((o) => o.id === entryDetail.tile.object_id);
                return object ? (
                  <Link
                    className="button primary"
                    href={
                      "/app/" +
                      (["people", "companies", "deals"].includes(object.slug)
                        ? object.slug
                        : "object-" + object.slug) +
                      "?record=" +
                      entryDetail.entry.id
                    }
                  >
                    Ouvrir la fiche CRM
                  </Link>
                ) : null;
              })()}
          </div>
        )}
      </Modal>
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Données derrière l’indicateur"
        description="Liste paginée des sources encore autorisées, selon les mêmes filtres que le calcul."
        wide
      >
        <ErrorMessage error={details.error} />
        {details.isFetching && <Loading />}
        {!details.isError && details.data && (
          <>
            <p>
              {details.data.data.total} éléments · page de 50 maximum. Les montants des moyennes et
              ratios sont recalculés en base.
            </p>
            <div className={styles.tableScroll}>
              <table>
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Étape / statut</th>
                    <th>Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {details.data.data.data.map((d) => (
                    <tr key={d.id}>
                      <td>
                        {d.title}
                        <small className={styles.sourceId}>{d.id}</small>
                      </td>
                      <td>{d.stage || d.status || "—"}</td>
                      <td>{d.currency ? d.amount + " " + d.currency : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!details.data.data.data.length && <p>Aucune source pour ces filtres.</p>}
            <div className={styles.actions}>
              <button
                className="button"
                disabled={!detail?.cursor}
                onClick={() => detail && setDetail({ ...detail, cursor: null })}
              >
                Première page
              </button>
              <button
                className="button"
                disabled={!details.data.data.next_cursor}
                onClick={() =>
                  detail && setDetail({ ...detail, cursor: details.data!.data.next_cursor })
                }
              >
                Page suivante
              </button>
            </div>
          </>
        )}
      </Modal>
    </main>
  );
}
