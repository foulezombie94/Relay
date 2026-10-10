"use client";
import { useState } from "react";
import { Eye, SlidersHorizontal, Database, Filter, Plus, Trash2 } from "lucide-react";
import { useRows, useWorkspace, request } from "../providers/data-provider";
import { Modal, ErrorMessage, str } from "../ui";
import {
  defaultTile,
  dimensionsFor,
  metricsFor,
  reportTile,
  dashboardKinds,
  dashboardVisuals,
  kindLabels,
  metricLabels,
  dimensionLabels,
  visualLabels,
  isMoneyMetric,
  isContentVisual,
  isRecordVisual,
  dashboardLinkPaths,
  type ReportTile,
  type DashboardResult,
} from "@/lib/domain/dashboards";
import { tileForVisual } from "@/lib/domain/dashboard-widgets";
import { DashboardWidget } from "./widget";
import { WidgetIcon } from "./widget-library";
import styles from "./dashboard.module.css";

const pathLabels: Record<(typeof dashboardLinkPaths)[number], string> = {
  "/app/people": "Contacts",
  "/app/companies": "Entreprises",
  "/app/deals": "Opportunités",
  "/app/tasks": "Tâches",
  "/app/notes": "Notes",
  "/app/meetings": "Réunions",
  "/app/assistant": "Ask Zyliad",
  "/app/integrations": "Intégrations",
  "/app/reports": "Rapports",
  "/app/workflows": "Automatisations",
};
export function WidgetEditor({
  initial,
  onClose,
  onSave,
}: {
  initial: ReportTile;
  onClose: () => void;
  onSave: (tile: ReportTile) => void;
}) {
  const { workspace, objects } = useWorkspace();
  const [tile, setTile] = useState(initial),
    [error, setError] = useState<Error | null>(null);
  const [tab, setTab] = useState<"view" | "data" | "filters">("view");
  const [preview, setPreview] = useState<DashboardResult>(),
    [busy, setBusy] = useState(false);
  const pipelines = useRows("pipelines", { size: 100 }),
    members = useRows("memberships", { size: 100 });
  const content = isContentVisual(tile.visual),
    records = isRecordVisual(tile.visual);
  const change = (patch: Partial<ReportTile>) => {
    setTile({ ...tile, ...patch });
    setPreview(undefined);
  };
  function validate() {
    const parsed = reportTile.safeParse(tile);
    if (!parsed.success) {
      setError(new Error(parsed.error.issues.map((issue) => issue.message).join(" ")));
      return null;
    }
    setError(null);
    return parsed.data;
  }
  async function showPreview() {
    const config = validate();
    if (!config) return;
    setBusy(true);
    try {
      const r = await request<{ data: DashboardResult }>(
        "/api/" + workspace.id + "/reports/dashboard",
        "POST",
        { dashboard: { name: "Aperçu", config: [config] } },
      );
      setPreview(r.data);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Aperçu indisponible"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Configurer le widget"
      wide
      className={styles.editorModal}
      description="Choisissez une vue et les données qu’elle présente. Les filtres du dashboard restent appliqués."
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const value = validate();
          if (value) onSave(value);
        }}
      >
        <div className={styles.editorHeading}>
          <span>
            <WidgetIcon visual={tile.visual} size={22} />
          </span>
          <label>
            Titre du widget
            <input
              required
              maxLength={100}
              value={tile.title}
              onChange={(e) => change({ title: e.target.value })}
            />
          </label>
        </div>
        <label className={styles.editorDescription}>
          Description
          <input
            maxLength={300}
            placeholder="Une courte description (facultatif)"
            value={tile.description}
            onChange={(e) => change({ description: e.target.value })}
          />
        </label>
        <div className={styles.editorTabs} role="group" aria-label="Sections de configuration">
          <button type="button" aria-pressed={tab === "view"} onClick={() => setTab("view")}>
            <SlidersHorizontal size={14} />
            Présentation
          </button>
          {!content && (
            <>
              <button type="button" aria-pressed={tab === "data"} onClick={() => setTab("data")}>
                <Database size={14} />
                Données
              </button>
              <button
                type="button"
                aria-pressed={tab === "filters"}
                onClick={() => setTab("filters")}
              >
                <Filter size={14} />
                Filtres
              </button>
            </>
          )}
        </div>
        {tab === "view" || content ? (
          <div className={styles.formGrid}>
            <label>
              Type de widget
              <select
                value={tile.visual}
                onChange={(e) => {
                  setTile(tileForVisual(tile, e.target.value as ReportTile["visual"]));
                  setPreview(undefined);
                }}
              >
                {dashboardVisuals.map((v) => (
                  <option key={v} value={v}>
                    {visualLabels[v]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Largeur
              <select
                value={tile.size}
                onChange={(e) => change({ size: e.target.value as ReportTile["size"] })}
              >
                <option value="small">¼ de ligne</option>
                <option value="third">⅓ de ligne</option>
                <option value="medium">½ ligne</option>
                <option value="large">Ligne entière</option>
              </select>
            </label>
            <label>
              Hauteur
              <select
                value={tile.height ?? "standard"}
                onChange={(e) => change({ height: e.target.value as ReportTile["height"] })}
              >
                <option value="compact">Compacte</option>
                <option value="standard">Standard</option>
                <option value="tall">Grande</option>
              </select>
            </label>
            <label>
              Couleur
              <select
                value={tile.color}
                onChange={(e) => change({ color: e.target.value as ReportTile["color"] })}
              >
                {Object.entries({
                  blue: "Bleu",
                  violet: "Violet",
                  teal: "Vert",
                  amber: "Ambre",
                  rose: "Rose",
                }).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {tile.visual === "text" && (
              <label className={styles.fullField}>
                Contenu
                <textarea
                  rows={6}
                  maxLength={1500}
                  placeholder="Écrivez une note pour votre équipe…"
                  value={tile.content ?? ""}
                  onChange={(e) => change({ content: e.target.value })}
                />
                <small>{tile.content?.length ?? 0}/1500 · texte simple</small>
              </label>
            )}
            {tile.visual === "links" && (
              <div className={styles.fullField}>
                <p className={styles.muted}>Raccourcis vers les pages Zyliad</p>
                {tile.links?.map((link, i) => (
                  <div key={i} className={styles.linkEditor}>
                    <input
                      aria-label={"Nom du raccourci " + (i + 1)}
                      maxLength={60}
                      required
                      value={link.label}
                      onChange={(e) =>
                        change({
                          links: tile.links?.map((item, n) =>
                            n === i ? { ...item, label: e.target.value } : item,
                          ),
                        })
                      }
                    />
                    <select
                      aria-label={"Destination du raccourci " + (i + 1)}
                      value={link.href}
                      onChange={(e) =>
                        change({
                          links: tile.links?.map((item, n) =>
                            n === i ? { ...item, href: e.target.value as typeof link.href } : item,
                          ),
                        })
                      }
                    >
                      {dashboardLinkPaths.map((path) => (
                        <option key={path} value={path}>
                          {pathLabels[path]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={"Supprimer le raccourci " + (i + 1)}
                      onClick={() => change({ links: tile.links?.filter((_, n) => n !== i) })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="button small"
                  disabled={(tile.links?.length ?? 0) >= 8}
                  onClick={() =>
                    change({
                      links: [...(tile.links ?? []), { label: "Contacts", href: "/app/people" }],
                    })
                  }
                >
                  <Plus size={13} />
                  Ajouter un lien
                </button>
              </div>
            )}
            {["goal", "gauge"].includes(tile.visual) && (
              <>
                <label>
                  Cible
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    max="1000000000000000"
                    value={tile.goal ?? ""}
                    onChange={(e) =>
                      change({ goal: e.target.value ? Number(e.target.value) : undefined })
                    }
                  />
                </label>
                {isMoneyMetric(tile.metric) && (
                  <label>
                    Devise de la cible
                    <input
                      maxLength={3}
                      pattern="[A-Z]{3}"
                      value={tile.goal_currency ?? ""}
                      placeholder={workspace.currency}
                      onChange={(e) =>
                        change({ goal_currency: e.target.value.toUpperCase() || undefined })
                      }
                    />
                  </label>
                )}
              </>
            )}
          </div>
        ) : tab === "data" ? (
          <div className={styles.formGrid}>
            <label>
              Source
              <select
                value={tile.kind}
                onChange={(e) => {
                  const kind = e.target.value as ReportTile["kind"];
                  setTile(
                    tileForVisual(
                      defaultTile({
                        id: tile.id,
                        title: tile.title,
                        description: tile.description,
                        kind,
                        size: tile.size,
                        height: tile.height,
                        color: tile.color,
                        date_field: kind === "meeting" || kind === "email" ? "occurred" : "created",
                      }),
                      tile.visual,
                    ),
                  );
                  setPreview(undefined);
                }}
              >
                {dashboardKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {kindLabels[kind]}
                  </option>
                ))}
              </select>
            </label>
            {tile.kind === "record" && (
              <label>
                Objet CRM
                <select
                  value={tile.object_id ?? ""}
                  onChange={(e) => change({ object_id: e.target.value || undefined })}
                >
                  <option value="">Tous les objets autorisés</option>
                  {objects.map((object) => (
                    <option key={object.id} value={object.id}>
                      {object.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!records && (
              <label>
                Mesure
                <select
                  value={tile.metric}
                  onChange={(e) => {
                    const metric = e.target.value as ReportTile["metric"];
                    change({
                      metric,
                      ...(metric === "stage_reached"
                        ? { group_by: "stage", visual: "funnel" }
                        : {}),
                      ...(["goal", "gauge"].includes(tile.visual) && isMoneyMetric(metric)
                        ? { goal_currency: tile.goal_currency ?? workspace.currency }
                        : {}),
                      ...(tile.visual === "heatmap" && metric !== "count"
                        ? { visual: "columns" }
                        : {}),
                    });
                  }}
                >
                  {metricsFor(tile.kind).map((metric) => (
                    <option key={metric} value={metric}>
                      {metricLabels[metric]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!records && (
              <label>
                Regrouper par
                <select
                  value={tile.group_by}
                  onChange={(e) => {
                    const group_by = e.target.value as ReportTile["group_by"];
                    const visual =
                      group_by === "none"
                        ? ["kpi", "goal", "gauge", "table"].includes(tile.visual)
                          ? tile.visual
                          : "kpi"
                        : ["kpi", "goal", "gauge"].includes(tile.visual) ||
                            (["line", "area", "combo"].includes(tile.visual) &&
                              !["day", "week", "month"].includes(group_by)) ||
                            (tile.visual === "heatmap" && group_by !== "day")
                          ? "bars"
                          : tile.visual;
                    change({
                      group_by,
                      visual,
                      ...(tile.metric === "stage_reached" && group_by !== "stage"
                        ? { metric: "count" }
                        : {}),
                    });
                  }}
                >
                  {dimensionsFor(tile.kind).map((dimension) => (
                    <option key={dimension} value={dimension}>
                      {dimensionLabels[dimension]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Date utilisée
              <select
                value={tile.date_field}
                onChange={(e) => change({ date_field: e.target.value as ReportTile["date_field"] })}
              >
                <option value="created">Création</option>
                <option value="occurred">Réception / réunion</option>
                {tile.kind === "record" && <option value="closed">Clôture observée</option>}
                {["task", "commitment"].includes(tile.kind) && (
                  <option value="due">Échéance</option>
                )}
              </select>
            </label>
            <p className={styles.fullField + " " + styles.muted}>
              {records
                ? "Les vues affichent au maximum 50 fiches par page. Recherche et tri portent sur la page affichée ; les filtres s’appliquent à toutes les sources."
                : "Les mesures sont calculées en base sur toutes les données autorisées. Les devises sont toujours séparées."}
            </p>
          </div>
        ) : (
          <div className={styles.formGrid}>
            {tile.kind === "record" && (
              <>
                <label>
                  Pipeline
                  <select
                    value={tile.pipeline_id ?? ""}
                    onChange={(e) => change({ pipeline_id: e.target.value || undefined })}
                  >
                    <option value="">Tous</option>
                    {pipelines.data?.data.map((p) => (
                      <option key={p.id} value={p.id}>
                        {str(p.name)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Opportunités
                  <select
                    value={tile.lifecycle}
                    onChange={(e) =>
                      change({ lifecycle: e.target.value as ReportTile["lifecycle"] })
                    }
                  >
                    <option value="all">Toutes</option>
                    <option value="open">Ouvertes</option>
                    <option value="won">Gagnées</option>
                    <option value="lost">Perdues</option>
                  </select>
                </label>
                <label>
                  Étape
                  <select
                    value={tile.stage ?? ""}
                    onChange={(e) => change({ stage: e.target.value || undefined })}
                  >
                    <option value="">Toutes</option>
                    {[
                      "Nouveau",
                      "Qualification",
                      "Proposition",
                      "Négociation",
                      "Gagné",
                      "Perdu",
                    ].map((stage) => (
                      <option key={stage}>{stage}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {["record", "task", "commitment"].includes(tile.kind) && (
              <label>
                Responsable
                <select
                  value={tile.owner_id ?? ""}
                  onChange={(e) => change({ owner_id: e.target.value || undefined })}
                >
                  <option value="">Toute l’équipe</option>
                  {members.data?.data.map((m) => (
                    <option key={m.id} value={str(m.user_id)}>
                      {str(m.display_name) || str(m.user_id)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {["task", "commitment"].includes(tile.kind) && (
              <>
                <label>
                  Statut
                  <select
                    value={tile.status ?? ""}
                    onChange={(e) => change({ status: e.target.value || undefined })}
                  >
                    <option value="">Tous</option>
                    {(tile.kind === "task"
                      ? ["open", "in_progress", "done", "cancelled"]
                      : ["proposed", "confirmed", "in_progress", "done", "postponed", "cancelled"]
                    ).map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={!!tile.overdue}
                    onChange={(e) => change({ overdue: e.target.checked || undefined })}
                  />
                  Seulement en retard
                </label>
              </>
            )}
            <label>
              Début propre au widget (UTC)
              <input
                type="date"
                value={tile.since?.slice(0, 10) ?? ""}
                onChange={(e) =>
                  change({ since: e.target.value ? e.target.value + "T00:00:00.000Z" : undefined })
                }
              />
            </label>
            <label>
              Fin exclusive (UTC)
              <input
                type="date"
                value={tile.until?.slice(0, 10) ?? ""}
                onChange={(e) =>
                  change({ until: e.target.value ? e.target.value + "T00:00:00.000Z" : undefined })
                }
              />
            </label>
          </div>
        )}
        <ErrorMessage error={error} />
        <div className={styles.editorFooter}>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => void showPreview()}
          >
            <Eye size={14} />
            {busy ? "Calcul…" : "Aperçu avec mes données"}
          </button>
          <button type="submit" className="button primary">
            Appliquer
          </button>
        </div>
        {preview && (
          <div className={styles.editorPreview}>
            <DashboardWidget result={preview.tiles[0]} onDetails={() => {}} />
          </div>
        )}
      </form>
    </Modal>
  );
}
