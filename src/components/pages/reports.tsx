"use client";
import { ReportBuilder } from "../reports/report-builder";
import { ForecastTotals } from "../reports/forecast-totals";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRows, useWorkspace, request } from "../providers/data-provider";
import { PageHeader, Loading, ErrorMessage, money, Badge, Empty, str } from "../ui";
import type { forecastDeals } from "@/lib/domain/pipelines";
import type { salesHistory } from "@/lib/domain/sales-history";
type Report = {
  total: number;
  tasks: number;
  counts: Record<string, number>;
  totals: Record<string, Record<string, number>>;
  forecast: ReturnType<typeof forecastDeals>;
  history: ReturnType<typeof salesHistory> | null;
  historyLimited: boolean;
};
export function ReportsPage() {
  const { workspace } = useWorkspace();
  const [pipeline, setPipeline] = useState("");
  const [owner, setOwner] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const pipelines = useRows("pipelines", { size: 100 });
  const members = useRows("memberships", { size: 100 });
  const q = useQuery({
    queryKey: ["rows", workspace.id, "reports", pipeline, owner, month],
    queryFn: () =>
      request<{ data: Report }>(
        "/api/" + workspace.id + "/reports?" + new URLSearchParams({ pipeline, owner, month }),
      ),
  });
  const report = q.data?.data;
  // A month selector rather than a native date input; the same month is used by the server in UTC.
  const years = Array.from(
    new Set([
      Number(month.slice(0, 4)),
      ...Array.from({ length: 12 }, (_, i) => new Date().getUTCFullYear() + 1 - i),
    ]),
  ).sort((a, b) => b - a);
  return (
    <>
      <ReportBuilder />
      <PageHeader
        title="Rapports et prévisions"
        description="Distinguez vos ventes ouvertes, vos résultats et vos hypothèses de conversion."
      />
      <div className="toolbar">
        <select
          style={{ width: "auto" }}
          aria-label="Pipeline du rapport"
          value={pipeline}
          onChange={(e) => setPipeline(e.target.value)}
        >
          <option value="">Tous les pipelines</option>
          {pipelines.data?.data.map((p) => (
            <option key={p.id} value={p.id}>
              {str(p.name)}
            </option>
          ))}
        </select>
        <select
          style={{ width: "auto" }}
          aria-label="Responsable du rapport"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        >
          <option value="">Toute l’équipe</option>
          <option value="me">Moi</option>
          {members.data?.data.map((m) => (
            <option key={m.id} value={str(m.user_id)}>
              {str(m.display_name)}
            </option>
          ))}
        </select>
        <select
          style={{ width: "auto" }}
          aria-label="Mois des résultats"
          value={month.slice(5)}
          onChange={(e) => setMonth(month.slice(0, 4) + "-" + e.target.value)}
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={String(i + 1).padStart(2, "0")}>
              {new Date(Date.UTC(2026, i, 15)).toLocaleDateString("fr-FR", {
                month: "long",
                timeZone: "UTC",
              })}
            </option>
          ))}
        </select>
        <select
          style={{ width: "auto" }}
          aria-label="Année des résultats"
          value={month.slice(0, 4)}
          onChange={(e) => setMonth(e.target.value + month.slice(4))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <ErrorMessage error={q.error || pipelines.error || members.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        report && (
          <>
            <div className="stats">
              <article>
                <span>Opportunités</span>
                <strong>{report.total}</strong>
              </article>
              <article>
                <span>Gagnées · toutes périodes</span>
                <strong>{report.counts["Gagné"] ?? 0}</strong>
              </article>
              <article>
                <span>Tâches ouvertes · responsable sélectionné</span>
                <strong>{report.tasks}</strong>
              </article>
            </div>
            {!report.total && (
              <Empty
                title="Vos rapports se rempliront avec vos opportunités"
                description="Ajoutez une valeur, une date de clôture et un pipeline à vos ventes."
              />
            )}
            {Object.entries(report.forecast).map(([currency, forecast]) => {
              const outcome = report.history?.outcomes[currency];
              return (
                <section className="detail-card" key={currency}>
                  <h2>{currency}</h2>
                  <ForecastTotals forecast={forecast} currency={currency} />
                  {report.history && (
                    <>
                      <h3>
                        Résultats du mois ·{" "}
                        {new Date(month + "-15T12:00:00Z").toLocaleDateString("fr-FR", {
                          month: "long",
                          year: "numeric",
                          timeZone: "UTC",
                        })}
                      </h3>
                      <div className="stats">
                        <article>
                          <span>Gagné · {outcome?.wonCount ?? 0} vente(s)</span>
                          <strong>{money(outcome?.won ?? 0, currency)}</strong>
                        </article>
                        <article>
                          <span>Perdu · {outcome?.lostCount ?? 0} vente(s)</span>
                          <strong>{money(outcome?.lost ?? 0, currency)}</strong>
                        </article>
                      </div>
                      {!!outcome?.undated && (
                        <p>
                          {outcome.undated} vente(s) clôturée(s) sans date d’issue fiable dans le
                          journal : exclue(s) des résultats mensuels.
                        </p>
                      )}
                    </>
                  )}
                  <h3>Clôtures attendues · opportunités ouvertes</h3>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Mois prévu</th>
                          <th>Nombre</th>
                          <th>Valeur ouverte</th>
                          <th>Forecast pondéré</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(forecast.months)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([m, v]) => (
                            <tr key={m}>
                              <td>
                                {m === "Sans date"
                                  ? m
                                  : new Date(m + "-15T12:00:00Z").toLocaleDateString("fr-FR", {
                                      month: "long",
                                      year: "numeric",
                                      timeZone: "UTC",
                                    })}
                              </td>
                              <td>{v.count}</td>
                              <td>{money(v.open, currency)}</td>
                              <td>{money(v.weighted, currency)}</td>
                            </tr>
                          ))}
                        {!Object.keys(forecast.months).length && (
                          <tr>
                            <td colSpan={4}>Aucune opportunité ouverte dans cette devise.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <h3 className="section-title">Valeurs par étape · toutes périodes</h3>
                  {Object.entries(report.totals[currency] ?? {}).map(([stage, value]) => (
                    <div className="report-bar" key={stage}>
                      <Badge value={stage} />
                      <div className="bar-track">
                        <div
                          style={{
                            width:
                              Math.max(
                                2,
                                (100 * value) /
                                  Math.max(1, ...Object.values(report.totals[currency])),
                              ) + "%",
                          }}
                        />
                      </div>
                      <strong>{money(value, currency)}</strong>
                    </div>
                  ))}
                  {Object.keys(forecast.reasons).length > 0 && (
                    <>
                      <h3 className="section-title">Raisons de perte · toutes périodes</h3>
                      <ul>
                        {Object.entries(forecast.reasons)
                          .sort((a, b) => b[1] - a[1])
                          .map(([reason, count]) => (
                            <li key={reason}>
                              {reason} · {count} opportunité
                              {count > 1 ? "s" : ""}
                            </li>
                          ))}
                      </ul>
                    </>
                  )}
                </section>
              );
            })}
            {report.historyLimited && (
              <p role="status">
                Historique trop volumineux pour ce rapport (100 000 événements maximum). Les
                résultats mensuels et les taux historiques ne sont pas affichés avec des données
                partielles.
              </p>
            )}
            {report.history && !!report.total && (
              <section className="detail-card">
                <h2>Hypothèses et taux de victoire observés</h2>
                <p>
                  Parmi les ventes actuellement clôturées ayant réellement traversé cette étape dans
                  le pipeline actuel : gagnées ÷ (gagnées + perdues). Une vente compte une seule
                  fois par étape. Les ventes ouvertes et les étapes non observées sont exclues.
                </p>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Pipeline / étape</th>
                        <th>Probabilité configurée</th>
                        <th>Taux observé</th>
                        <th>Ventes résolues</th>
                        <th>Lecture</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.history.calibration.map((cell) => (
                        <tr key={cell.pipelineId + cell.stage}>
                          <td>
                            {cell.pipeline} · {cell.label}
                          </td>
                          <td>{cell.configured} %</td>
                          <td>{cell.rate === null ? "Non disponible" : cell.rate + " %"}</td>
                          <td>
                            {cell.won} gagnée(s) / {cell.lost} perdue(s)
                          </td>
                          <td>
                            {cell.resolved === 0
                              ? "Aucun historique exploitable"
                              : cell.resolved < 20
                                ? "Échantillon faible (< 20 ventes)"
                                : "Comparaison indicative"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="footer-note">
                  Historique disponible, toutes périodes confondues, filtré par pipeline et
                  responsable actuels. La comparaison ne modifie jamais automatiquement les
                  probabilités. Ce taux descriptif n’est pas une prédiction individuelle.
                </p>
              </section>
            )}
            <p className="footer-note">
              Forecast = montant × probabilité définie par votre équipe, uniquement pour les ventes
              ouvertes. Le mois sélectionné concerne les issues gagnées/perdues : date du dernier
              passage effectif au statut actuel dans le journal (UTC), montants actuels des fiches.
              La date de clôture prévue sert seulement au forecast. Les devises restent séparées.
              Les ventes archivées sont exclues ; les tâches sont filtrées par responsable, tous
              pipelines confondus.
            </p>
          </>
        )
      )}
    </>
  );
}
