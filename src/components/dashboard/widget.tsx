"use client";
import Link from "next/link";
import { useState, type ReactNode, type CSSProperties } from "react";
import { ArrowDownRight, ArrowUpRight, ArrowRight, Database, GripVertical } from "lucide-react";
import {
  dashboardDelta,
  formatDashboardValue,
  isContentVisual,
  isRecordVisual,
  kindLabels,
  type DashboardTileResult,
  type DashboardDatum,
  type DashboardEntry,
} from "@/lib/domain/dashboards";
import { DashboardChart, widgetColors } from "./chart";
import { RecordWidget, type EntryPageRequest } from "./record-widget";
import styles from "./dashboard.module.css";
import boardStyles from "./board.module.css";

export function DashboardWidget({
  result,
  onDetails,
  actions,
  onEntry,
  onEntryPage,
  generation,
}: {
  result: DashboardTileResult;
  onDetails: (datum: DashboardDatum | null) => void;
  actions?: ReactNode;
  onEntry?: (entry: DashboardEntry) => void;
  onEntryPage?: EntryPageRequest;
  generation?: string;
}) {
  const [currency, setCurrency] = useState("");
  const { tile, current, previous } = result;
  const currencies = Array.from(
    new Set(current?.totals.map((row) => row.currency).filter(Boolean) ?? []),
  ) as string[];
  const selected = currencies.includes(currency) ? currency : currencies[0];
  const rows = current?.data.filter((row) => !selected || row.currency === selected) ?? [];
  const total = current?.totals.find((row) => !selected || row.currency === selected);
  const prior = previous?.totals.find((row) => row.currency === total?.currency);
  const delta = dashboardDelta(total?.value ?? null, prior?.value ?? null);
  const color = widgetColors[tile.color];
  const goal = tile.goal ?? 100;
  const percentage =
    total?.value === null || total?.value === undefined ? null : (Number(total.value) / goal) * 100;
  const progress = percentage === null ? null : Math.min(100, Math.max(0, percentage));
  return (
    <article
      className={styles.widget}
      data-visual={tile.visual}
      data-height={tile.height ?? "standard"}
      style={{ "--widget-color": color } as CSSProperties}
    >
      <header>
        <div className={styles.widgetTitle}>
          <GripVertical size={15} aria-hidden="true" />
          <h3>{tile.title}</h3>
        </div>
        <div className={styles.widgetActions}>{actions}</div>
      </header>
      {tile.description && <p className={styles.widgetDescription}>{tile.description}</p>}
      {isContentVisual(tile.visual) ? (
        tile.visual === "text" ? (
          <div className={styles.noteContent}>
            {tile.content || "Ajoutez une note en configurant ce bloc."}
          </div>
        ) : tile.visual === "links" ? (
          <div className={styles.shortcuts}>
            {tile.links?.map((link, i) => (
              <Link key={i} href={link.href}>
                {link.label}
                <ArrowRight size={14} />
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.sectionRule} />
        )
      ) : result.error ? (
        <p role="alert" className={styles.warning}>
          {result.error}
        </p>
      ) : isRecordVisual(tile.visual) ? (
        result.entries ? (
          <RecordWidget
            key={(generation ?? "") + JSON.stringify(tile)}
            tile={tile}
            initial={result.entries}
            onRequest={onEntryPage}
            onOpen={onEntry ?? (() => onDetails(null))}
          />
        ) : (
          <p className={styles.muted}>Chargement de la vue…</p>
        )
      ) : !current ? (
        <p className={styles.muted}>Calcul en cours…</p>
      ) : (
        <>
          {currencies.length > 1 && (
            <div className={styles.currencyTabs} role="group" aria-label="Devise de l’indicateur">
              {currencies.map((c) => (
                <button key={c} aria-pressed={selected === c} onClick={() => setCurrency(c)}>
                  {c}
                </button>
              ))}
              <small>Devises séparées</small>
            </div>
          )}
          {tile.visual === "table" && (
            <div className={boardStyles.tableOverview}>
              <div>
                <strong>
                  {formatDashboardValue(total?.value ?? null, tile.metric, total?.currency)}
                </strong>
                <span>{tile.metric === "amount" ? "Montant total" : "Total"}</span>
                {delta !== null && (
                  <small data-positive={delta >= 0}>
                    {delta >= 0 ? "+" : ""}
                    {delta.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}% vs période
                    précédente
                  </small>
                )}
              </div>
              <div>
                <strong>{total?.count ?? "—"}</strong>
                <span>{kindLabels[tile.kind]}</span>
              </div>
            </div>
          )}
          {["kpi", "goal", "gauge"].includes(tile.visual) ? (
            <div className={styles.kpi}>
              {tile.visual === "gauge" ? (
                <div className={styles.gauge}>
                  <svg viewBox="0 0 120 120" aria-hidden="true">
                    <circle
                      cx="60"
                      cy="60"
                      r="48"
                      fill="none"
                      stroke="var(--relay-border)"
                      strokeWidth="9"
                    />
                    <circle
                      cx="60"
                      cy="60"
                      r="48"
                      fill="none"
                      stroke={color}
                      strokeWidth="9"
                      strokeLinecap="round"
                      strokeDasharray={(progress ?? 0) * 3.016 + " 301.6"}
                      transform="rotate(-90 60 60)"
                    />
                  </svg>
                  <div>
                    <strong>
                      {percentage === null
                        ? "—"
                        : percentage.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + "%"}
                    </strong>
                    <span>de l’objectif</span>
                  </div>
                </div>
              ) : (
                <strong className={styles.kpiValue}>
                  {formatDashboardValue(total?.value ?? null, tile.metric, total?.currency)}
                </strong>
              )}
              {delta !== null && (
                <div className={styles.delta}>
                  <span data-positive={delta >= 0}>
                    {delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                    {Math.abs(delta).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}%
                  </span>
                  <small>vs période précédente</small>
                </div>
              )}
              {["goal", "gauge"].includes(tile.visual) && (
                <>
                  <div
                    className={styles.goalTrack}
                    role="meter"
                    aria-label="Progression de l’objectif"
                    aria-valuemin={0}
                    aria-valuemax={goal}
                    aria-valuenow={
                      progress === null
                        ? undefined
                        : Math.min(goal, Math.max(0, Number(total?.value)))
                    }
                  >
                    <i style={{ width: (progress ?? 0) + "%" }} />
                  </div>
                  <div className={styles.goalCaption}>
                    <span>
                      {tile.visual === "gauge"
                        ? formatDashboardValue(total?.value ?? null, tile.metric, total?.currency)
                        : percentage === null
                          ? "—"
                          : percentage.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) +
                            "% atteint"}
                    </span>
                    <span>
                      Cible : {formatDashboardValue(String(goal), tile.metric, tile.goal_currency)}
                    </span>
                  </div>
                </>
              )}
            </div>
          ) : !rows.length ? (
            <p className={styles.empty}>Aucune donnée pour ces filtres.</p>
          ) : tile.visual !== "table" ? (
            <DashboardChart tile={tile} rows={rows} currency={selected} onDetails={onDetails} />
          ) : null}
          {!["kpi", "goal", "gauge"].includes(tile.visual) && (
            <details open={tile.visual === "table"} className={styles.values}>
              <summary>
                {tile.visual === "table"
                  ? "Répartition et sources"
                  : "Valeurs calculées et fiches sources"}
              </summary>
              <div className={styles.tableScroll}>
                <table>
                  <thead>
                    <tr>
                      <th>Groupe</th>
                      <th>Valeur</th>
                      <th>Sources</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i}>
                        <td>
                          <span className={boardStyles.groupLabel}>
                            <i aria-hidden="true" />
                            {row.label}
                          </span>
                        </td>
                        <td>{formatDashboardValue(row.value, tile.metric, row.currency)}</td>
                        <td>
                          <button className={styles.sourceButton} onClick={() => onDetails(row)}>
                            Voir {row.count}
                            <ArrowUpRight size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          {current.partial && (
            <p className={styles.warning}>
              Plus de 200 groupes : l’aperçu est partiel. Affinez vos filtres.
            </p>
          )}
          {current.missing_history > 0 && (
            <p className={styles.warning}>
              {current.missing_history} fiches sans historique exploitable. Le calcul historique est
              incomplet.
            </p>
          )}
          <footer>
            <span>
              <Database size={11} />
              {kindLabels[tile.kind]} · {total?.sample_size ?? current.total} sources
            </span>
            <button onClick={() => onDetails(total ?? null)} className={styles.textButton}>
              Voir les sources
              <ArrowUpRight size={12} />
            </button>
          </footer>
        </>
      )}
      {result.filter_note && <p className={styles.muted}>{result.filter_note}</p>}
    </article>
  );
}
