"use client";
import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  dashboardDelta,
  formatDashboardValue,
  type DashboardTileResult,
  type DashboardDatum,
} from "@/lib/domain/dashboards";
import styles from "./dashboard.module.css";
const colors = {
  blue: "#4169e1",
  violet: "#8662dc",
  teal: "#189b87",
  amber: "#cf921c",
  rose: "#d8587a",
};
export function DashboardWidget({
  result,
  onDetails,
}: {
  result: DashboardTileResult;
  onDetails: (datum: DashboardDatum | null) => void;
}) {
  const [currency, setCurrency] = useState("");
  const { tile, current, previous } = result;
  const currencies = Array.from(
    new Set(current?.totals.map((d) => d.currency).filter(Boolean) ?? []),
  ) as string[];
  const selected = currencies.includes(currency) ? currency : currencies[0];
  const rows = current?.data.filter((d) => !selected || d.currency === selected) ?? [];
  const total = current?.totals.find((d) => !selected || d.currency === selected);
  const prior = previous?.totals.find((d) => d.currency === total?.currency);
  const delta = dashboardDelta(total?.value ?? null, prior?.value ?? null);
  const color = colors[tile.color],
    chartRows = rows.map((d) => ({ ...d, number: Number(d.value ?? 0) }));
  const tooltip = (
    <Tooltip
      formatter={(_, __, item) =>
        formatDashboardValue((item.payload as DashboardDatum).value, tile.metric, selected)
      }
    />
  );
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf0f5" />
      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={55} />
    </>
  );
  const choose = (index: number) => {
    if (rows[index]) onDetails(rows[index]);
  };
  return (
    <article className={styles.widget} style={{ borderTopColor: color }}>
      <header>
        <h3>{tile.title}</h3>
        <span>{currencies.length > 1 ? "Devises séparées" : ""}</span>
      </header>
      {tile.description && <p className={styles.muted}>{tile.description}</p>}
      {currencies.length > 1 && (
        <div className={styles.tabs} role="group" aria-label="Devise de l’indicateur">
          {currencies.map((c) => (
            <button key={c} aria-pressed={selected === c} onClick={() => setCurrency(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
      {result.error ? (
        <p role="alert" className={styles.warning}>
          {result.error}
        </p>
      ) : !current ? (
        <p>Calcul en cours…</p>
      ) : (
        <>
          {["kpi", "goal"].includes(tile.visual) ? (
            <div className={styles.kpi}>
              <strong style={{ color }}>
                {formatDashboardValue(total?.value ?? null, tile.metric, total?.currency)}
              </strong>
              {delta !== null && (
                <span className={styles.muted}>
                  {delta > 0 ? "+" : ""}
                  {delta.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % · période
                  précédente de même durée
                </span>
              )}
              {tile.visual === "goal" && (
                <>
                  <progress
                    max={tile.goal}
                    value={Math.min(tile.goal ?? 1, Math.max(0, Number(total?.value ?? 0)))}
                    aria-label="Progression de l’objectif"
                  />
                  <span>
                    Objectif :{" "}
                    {formatDashboardValue(String(tile.goal), tile.metric, tile.goal_currency)}
                  </span>
                </>
              )}
              <small>{total?.sample_size ?? 0} éléments dans le calcul</small>
            </div>
          ) : !rows.length ? (
            <p className={styles.empty}>Aucune donnée pour ces filtres.</p>
          ) : tile.visual === "table" ? null : tile.visual === "funnel" ? (
            <div className={styles.funnel}>
              {rows.map((d, i) => (
                <button key={i} onClick={() => onDetails(d)}>
                  <span>{d.label}</span>
                  <meter
                    min={0}
                    max={Math.max(1, ...chartRows.map((x) => x.number))}
                    value={Math.max(0, Number(d.value))}
                  />
                  <b>{formatDashboardValue(d.value, tile.metric, d.currency)}</b>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.chart}>
              <ResponsiveContainer width="100%" height={240}>
                {tile.visual === "donut" ? (
                  <PieChart>
                    {tooltip}
                    <Pie
                      data={chartRows}
                      dataKey="number"
                      nameKey="label"
                      innerRadius={55}
                      outerRadius={90}
                      onClick={(_, i) => choose(i)}
                    >
                      {chartRows.map((_, i) => (
                        <Cell key={i} fill={Object.values(colors)[i % 5]} />
                      ))}
                    </Pie>
                  </PieChart>
                ) : tile.visual === "area" ? (
                  <AreaChart data={chartRows}>
                    {axes}
                    {tooltip}
                    <Area dataKey="number" stroke={color} fill={color} fillOpacity={0.12} />
                  </AreaChart>
                ) : tile.visual === "line" ? (
                  <LineChart data={chartRows}>
                    {axes}
                    {tooltip}
                    <Line dataKey="number" stroke={color} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                ) : (
                  <BarChart
                    data={chartRows}
                    layout={tile.visual === "bars" ? "vertical" : "horizontal"}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#edf0f5" />
                    <XAxis
                      type={tile.visual === "bars" ? "number" : "category"}
                      dataKey={tile.visual === "bars" ? undefined : "label"}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      type={tile.visual === "bars" ? "category" : "number"}
                      dataKey={tile.visual === "bars" ? "label" : undefined}
                      width={tile.visual === "bars" ? 105 : 55}
                      tick={{ fontSize: 11 }}
                    />
                    {tooltip}
                    <Bar
                      dataKey="number"
                      fill={color}
                      radius={[4, 4, 4, 4]}
                      onClick={(_, i) => choose(i)}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
          {!["kpi", "goal"].includes(tile.visual) && (
            <details open={tile.visual === "table"} className={styles.values}>
              <summary>Valeurs et fiches sources</summary>
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
                    {rows.map((d, i) => (
                      <tr key={i}>
                        <td>{d.label}</td>
                        <td>{formatDashboardValue(d.value, tile.metric, d.currency)}</td>
                        <td>
                          <button className="button small" onClick={() => onDetails(d)}>
                            Voir ({d.count})
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
              Groupes partiels : plus de 200 groupes. Affinez vos filtres.
            </p>
          )}
          {current.missing_history > 0 && (
            <p className={styles.warning}>
              {current.missing_history} fiches sans historique exploitable. Le calcul historique est
              incomplet.
            </p>
          )}
          <footer>
            <span>{current.coverage}</span>
            {tile.group_by === "none" && (
              <button onClick={() => onDetails(total ?? null)} className={styles.textButton}>
                Voir les sources
              </button>
            )}
          </footer>
        </>
      )}
      {result.filter_note && <p className={styles.muted}>{result.filter_note}</p>}
    </article>
  );
}
