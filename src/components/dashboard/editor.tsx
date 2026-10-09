"use client";
import { useState } from "react";
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
  type ReportTile,
  type DashboardResult,
} from "@/lib/domain/dashboards";
import { DashboardWidget } from "./widget";
import styles from "./dashboard.module.css";
export function WidgetEditor({
  initial,
  onClose,
  onSave,
}: {
  initial: ReportTile;
  onClose: () => void;
  onSave: (tile: ReportTile) => void;
}) {
  const { workspace, objects } = useWorkspace(),
    [tile, setTile] = useState(initial),
    [error, setError] = useState<Error | null>(null);
  const [preview, setPreview] = useState<DashboardResult>(),
    [busy, setBusy] = useState(false);
  const pipelines = useRows("pipelines", { size: 100 }),
    members = useRows("memberships", { size: 100 });
  const change = (patch: Partial<ReportTile>) => {
    setTile({ ...tile, ...patch });
    setPreview(undefined);
  };
  const validate = () => {
    const parsed = reportTile.safeParse(tile);
    if (!parsed.success) {
      setError(new Error(parsed.error.issues.map((i) => i.message).join(" ")));
      return null;
    }
    setError(null);
    return parsed.data;
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Configurer l’indicateur"
      wide
      description="Les filtres de cet indicateur se combinent aux filtres du dashboard."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const value = validate();
          if (value) onSave(value);
        }}
        className="stack"
      >
        <div className={styles.formGrid}>
          <label>
            Titre
            <input
              required
              maxLength={100}
              value={tile.title}
              onChange={(e) => change({ title: e.target.value })}
            />
          </label>
          <label>
            Description
            <input
              maxLength={300}
              value={tile.description}
              onChange={(e) => change({ description: e.target.value })}
            />
          </label>
          <label>
            Données
            <select
              value={tile.kind}
              onChange={(e) =>
                setTile(
                  defaultTile({
                    id: tile.id,
                    title: tile.title,
                    kind: e.target.value as ReportTile["kind"],
                    size: tile.size,
                    color: tile.color,
                  }),
                )
              }
            >
              {dashboardKinds.map((k) => (
                <option key={k} value={k}>
                  {kindLabels[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mesure
            <select
              value={tile.metric}
              onChange={(e) => {
                const metric = e.target.value as ReportTile["metric"];
                change({
                  metric,
                  ...(metric === "stage_reached" ? { group_by: "stage", visual: "funnel" } : {}),
                });
              }}
            >
              {metricsFor(tile.kind).map((m) => (
                <option key={m} value={m}>
                  {metricLabels[m]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Regrouper par
            <select
              value={tile.group_by}
              onChange={(e) => {
                const group_by = e.target.value as ReportTile["group_by"];
                change({ group_by, visual: group_by === "none" ? "kpi" : "bars" });
              }}
            >
              {dimensionsFor(tile.kind).map((d) => (
                <option key={d} value={d}>
                  {dimensionLabels[d]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Présentation
            <select
              value={tile.visual}
              onChange={(e) => {
                const visual = e.target.value as ReportTile["visual"];
                change({
                  visual,
                  ...(["kpi", "goal"].includes(visual)
                    ? { group_by: "none" }
                    : ["line", "area"].includes(visual)
                      ? { group_by: "month" }
                      : {}),
                });
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
            Date utilisée
            <select
              value={tile.date_field}
              onChange={(e) => change({ date_field: e.target.value as ReportTile["date_field"] })}
            >
              <option value="created">Création</option>
              <option value="occurred">Réception / réunion</option>
              {tile.kind === "record" && <option value="closed">Clôture observée</option>}
              {["task", "commitment"].includes(tile.kind) && <option value="due">Échéance</option>}
            </select>
          </label>
          <label>
            Largeur
            <select
              value={tile.size}
              onChange={(e) => change({ size: e.target.value as ReportTile["size"] })}
            >
              <option value="small">¼ de ligne</option>
              <option value="medium">½ ligne</option>
              <option value="large">Ligne entière</option>
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
          {tile.kind === "record" && (
            <>
              <label>
                Objet
                <select
                  value={tile.object_id ?? ""}
                  onChange={(e) => change({ object_id: e.target.value || undefined })}
                >
                  <option value="">Tous les objets autorisés</option>
                  {objects.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
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
                  onChange={(e) => change({ lifecycle: e.target.value as ReportTile["lifecycle"] })}
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
                  {["Nouveau", "Qualification", "Proposition", "Négociation", "Gagné", "Perdu"].map(
                    (s) => (
                      <option key={s}>{s}</option>
                    ),
                  )}
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
                  ).map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!!tile.overdue}
                  onChange={(e) => change({ overdue: e.target.checked || undefined })}
                />{" "}
                Seulement en retard
              </label>
            </>
          )}
          <label>
            Début propre à l’indicateur (UTC)
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
          {tile.visual === "goal" && (
            <>
              <label>
                Objectif
                <input
                  required
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
                  Devise de l’objectif
                  <input
                    required
                    maxLength={3}
                    pattern="[A-Z]{3}"
                    placeholder="EUR"
                    value={tile.goal_currency ?? ""}
                    onChange={(e) =>
                      change({ goal_currency: e.target.value.toUpperCase() || undefined })
                    }
                  />
                </label>
              )}
            </>
          )}
        </div>
        <ErrorMessage error={error} />
        <div className={styles.actions}>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={async () => {
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
            }}
          >
            Aperçu avec mes données
          </button>
          <button className="button primary">Appliquer</button>
        </div>
        {preview && <DashboardWidget result={preview.tiles[0]} onDetails={() => {}} />}
      </form>
    </Modal>
  );
}
