"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { request, useRows, useSave, useWorkspace } from "./data-provider";
import { ErrorMessage, Modal, str } from "./ui";
import type { ReportTile } from "@/lib/domain/dashboards";
const initial: ReportTile = {
  title: "Mes fiches",
  kind: "record",
  group_by: "none",
  metric: "count",
  visual: "table",
};
export function ReportBuilder() {
  const { workspace, objects } = useWorkspace();
  const rows = useRows("report_dashboards", { size: 100 });
  const { save, remove, busy } = useSave();
  const [selected, setSelected] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [tiles, setTiles] = useState<ReportTile[]>([{ ...initial }]);
  const results = useQuery({
    queryKey: ["rows", workspace.id, "dashboard-results", selected],
    enabled: !!selected,
    queryFn: () =>
      request<{
        data: {
          name: string;
          tiles: Array<{
            title: string;
            metric: string;
            visual: string;
            partial: boolean;
            data: Array<{
              dimension: string;
              count: number;
              currency?: string;
              amount?: string;
              average_amount?: string;
            }>;
          }>;
        };
      }>(`/api/${workspace.id}/reports/dashboard?id=${selected}`),
  });
  return (
    <section className="detail-card">
      <h2>Dashboards personnalisés</h2>
      <div className="row-actions">
        <select
          aria-label="Dashboard"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Choisir un dashboard</option>
          {rows.data?.data.map((r) => (
            <option key={r.id} value={r.id}>
              {str(r.name)} {r.visibility === "workspace" ? "· partagé" : "· privé"}
            </option>
          ))}
        </select>
        <button
          className="button"
          disabled={workspace.role === "viewer"}
          onClick={() => {
            setName("");
            setTiles([{ ...initial }]);
            setOpen(true);
          }}
        >
          Créer un dashboard
        </button>
        {selected && workspace.role !== "viewer" && (
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              if (window.confirm("Supprimer ce dashboard ?")) {
                await remove("report_dashboards", selected);
                setSelected("");
              }
            }}
          >
            Supprimer
          </button>
        )}
      </div>
      <ErrorMessage error={rows.error || results.error} />
      <div className="card-grid">
        {results.data?.data.tiles.map((t, i) => (
          <article className="detail-card" key={i}>
            <h3>{t.title}</h3>
            {t.partial && <p>Groupes partiels : affinez les filtres.</p>}
            <table>
              <thead>
                <tr>
                  <th>Groupe</th>
                  <th>{t.metric === "count" ? "Nombre" : "Montant"}</th>
                </tr>
              </thead>
              <tbody>
                {t.data.map((r, j) => (
                  <tr key={j}>
                    <td>{r.dimension || "Non renseigné"}</td>
                    <td>
                      {t.metric === "count" ? r.count : r[t.metric as "amount" | "average_amount"]}{" "}
                      {t.metric !== "count" && r.currency}
                      {t.visual === "bars" && (
                        <meter
                          value={Number(
                            t.metric === "count"
                              ? r.count
                              : r[t.metric as "amount" | "average_amount"],
                          )}
                          min={0}
                          max={Math.max(
                            1,
                            ...t.data.map((x) =>
                              Number(
                                t.metric === "count"
                                  ? x.count
                                  : x[t.metric as "amount" | "average_amount"],
                              ),
                            ),
                          )}
                          aria-label={r.dimension || "Valeur"}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        ))}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Composer un dashboard">
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await save("report_dashboards", {
              name,
              visibility: shared ? "workspace" : "private",
              config: tiles,
            });
            setSelected(r.id);
            setOpen(false);
          }}
        >
          <label>
            Nom
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />{" "}
            Partager dans l’espace (chacun voit les données autorisées)
          </label>
          {tiles.map((tile, i) => {
            const change = (patch: Partial<ReportTile>) =>
              setTiles((v) => v.map((x, j) => (i === j ? { ...x, ...patch } : x)));
            return (
              <fieldset key={i} className="stack">
                <legend>Indicateur {i + 1}</legend>
                <label>
                  Titre
                  <input
                    required
                    value={tile.title}
                    maxLength={100}
                    onChange={(e) => change({ title: e.target.value })}
                  />
                </label>
                <label>
                  Données
                  <select
                    value={tile.kind}
                    onChange={(e) => {
                      const kind = e.target.value as ReportTile["kind"];
                      setTiles((v) =>
                        v.map((x, j) =>
                          i === j
                            ? {
                                title: x.title,
                                kind,
                                group_by: "none",
                                metric: "count",
                                visual: x.visual,
                              }
                            : x,
                        ),
                      );
                    }}
                  >
                    {["record", "task", "commitment", "email", "meeting"].map((k) => (
                      <option key={k} value={k}>
                        {
                          {
                            record: "Fiches",
                            task: "Tâches",
                            commitment: "Engagements",
                            email: "Emails importés",
                            meeting: "Réunions",
                          }[k]
                        }
                      </option>
                    ))}
                  </select>
                </label>
                {tile.kind === "record" && (
                  <label>
                    Objet
                    <select
                      value={tile.object_id ?? ""}
                      onChange={(e) => {
                        const { object_id: _id, ...rest } = tile;
                        setTiles((v) =>
                          v.map((x, j) =>
                            i === j
                              ? {
                                  ...rest,
                                  ...(e.target.value ? { object_id: e.target.value } : {}),
                                }
                              : x,
                          ),
                        );
                      }}
                    >
                      <option value="">Tous</option>
                      {objects.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Mesure
                  <select
                    value={tile.metric}
                    onChange={(e) => change({ metric: e.target.value as ReportTile["metric"] })}
                  >
                    <option value="count">Nombre</option>
                    {tile.kind === "record" && (
                      <>
                        <option value="amount">Somme par devise</option>
                        <option value="average_amount">Moyenne par devise</option>
                      </>
                    )}
                  </select>
                </label>
                <label>
                  Dimension
                  <select
                    value={tile.group_by}
                    onChange={(e) => change({ group_by: e.target.value as ReportTile["group_by"] })}
                  >
                    <option value="none">Total</option>
                    <option value="month">Mois de création/réception</option>
                    {tile.kind === "record" && (
                      <>
                        <option value="stage">Étape</option>
                        <option value="pipeline">Pipeline</option>
                      </>
                    )}
                    {["task", "commitment"].includes(tile.kind) && (
                      <option value="status">Statut</option>
                    )}
                    {["record", "task", "commitment"].includes(tile.kind) && (
                      <option value="owner">Responsable</option>
                    )}
                  </select>
                </label>
                <label>
                  Présentation
                  <select
                    value={tile.visual}
                    onChange={(e) => change({ visual: e.target.value as ReportTile["visual"] })}
                  >
                    <option value="table">Tableau</option>
                    <option value="bars">Barres</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="button small"
                  disabled={tiles.length === 1}
                  onClick={() => setTiles((v) => v.filter((_, j) => j !== i))}
                >
                  Retirer l’indicateur
                </button>
              </fieldset>
            );
          })}
          <button
            type="button"
            className="button"
            disabled={tiles.length >= 12}
            onClick={() => setTiles((v) => [...v, { ...initial }])}
          >
            Ajouter un indicateur
          </button>
          <button className="button primary" disabled={busy}>
            Enregistrer
          </button>
        </form>
      </Modal>
    </section>
  );
}
