"use client";
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
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Treemap,
  ComposedChart,
} from "recharts";
import {
  formatDashboardValue,
  type DashboardDatum,
  type ReportTile,
} from "@/lib/domain/dashboards";
import styles from "./dashboard.module.css";
import { chartTooltipValue } from "@/lib/domain/dashboard-widgets";

export const widgetColors = {
  blue: "#527ce8",
  violet: "#9275d7",
  teal: "#3eab96",
  amber: "#d8a551",
  rose: "#d77c92",
};
type Props = {
  tile: ReportTile;
  rows: DashboardDatum[];
  currency?: string;
  onDetails: (row: DashboardDatum) => void;
};
export function DashboardChart({ tile, rows, currency, onDetails }: Props) {
  const color = widgetColors[tile.color];
  const data = rows
    .filter((row) => row.value !== null && Number.isFinite(Number(row.value)))
    .map((row) => ({ ...row, number: Number(row.value) }));
  const label = (row: DashboardDatum) => formatDashboardValue(row.value, tile.metric, row.currency);
  if (!data.length)
    return <p className={styles.empty}>Aucune valeur calculable pour ces filtres.</p>;
  if (
    ["pie", "donut", "radar", "treemap"].includes(tile.visual) &&
    data.some((row) => row.number < 0)
  )
    return (
      <p className={styles.warning}>
        Cette présentation nécessite des valeurs positives. Consultez les valeurs ci-dessous ou
        choisissez des barres.
      </p>
    );
  if (["pie", "donut", "treemap"].includes(tile.visual) && data.every((row) => row.number === 0))
    return (
      <p className={styles.empty}>
        Les valeurs sont nulles pour cette période. La répartition est disponible ci-dessous.
      </p>
    );
  if (tile.visual === "ranking" || tile.visual === "funnel") {
    const ordered =
      tile.visual === "ranking" ? [...data].sort((a, b) => b.number - a.number) : data;
    const max = Math.max(1, ...ordered.map((row) => Math.abs(row.number)));
    return (
      <div className={styles.ranking}>
        {ordered.map((row, i) => (
          <button key={row.dimension ?? i} onClick={() => onDetails(row)}>
            {tile.visual === "ranking" && <span className={styles.rank}>{i + 1}</span>}
            <span className={styles.rankLabel}>
              {row.label}
              <span className={styles.rankTrack}>
                <i
                  style={{
                    width: Math.max(0, (Math.abs(row.number) / max) * 100) + "%",
                    background: color,
                  }}
                />
              </span>
            </span>
            <strong>{label(row)}</strong>
          </button>
        ))}
      </div>
    );
  }
  if (tile.visual === "heatmap") {
    const sorted = [...data].sort((a, b) => (a.dimension ?? "").localeCompare(b.dimension ?? ""));
    const max = Math.max(1, ...sorted.map((row) => row.number));
    return (
      <div className={styles.heatmap}>
        <div>
          {sorted.map((row, i) => (
            <button
              key={row.dimension ?? i}
              style={{ background: color, opacity: 0.15 + (Math.max(0, row.number) / max) * 0.85 }}
              title={row.label + " · " + label(row)}
              aria-label={row.label + " : " + label(row)}
              onClick={() => onDetails(row)}
            />
          ))}
        </div>
        <p>
          {sorted[0]?.label} — {sorted.at(-1)?.label}
          <span>
            Moins <i style={{ background: color, opacity: 0.2 }} />
            <i style={{ background: color, opacity: 0.6 }} />
            <i style={{ background: color }} /> Plus
          </span>
        </p>
      </div>
    );
  }
  if (tile.visual === "stat_grid")
    return (
      <div className={styles.statGrid}>
        {data.map((row, i) => (
          <button key={row.dimension ?? i} onClick={() => onDetails(row)}>
            <span>{row.label}</span>
            <strong style={{ color }}>{label(row)}</strong>
            <small>{row.count} sources</small>
          </button>
        ))}
      </div>
    );
  const tooltip = (
    <Tooltip
      contentStyle={{
        background: "var(--relay-surface)",
        border: "1px solid var(--relay-border)",
        borderRadius: 8,
        color: "var(--relay-ink)",
        fontSize: 12,
      }}
      formatter={(value, name, item) =>
        name === "Fiches"
          ? String(value)
          : formatDashboardValue(chartTooltipValue(rows, item.payload), tile.metric, currency)
      }
    />
  );
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--relay-border)" />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 10, fill: "var(--relay-muted)" }}
        tickLine={false}
        axisLine={false}
      />
      <YAxis
        tick={{ fontSize: 10, fill: "var(--relay-muted)" }}
        tickLine={false}
        axisLine={false}
        width={55}
      />
    </>
  );
  return (
    <div className={styles.chart}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        {tile.visual === "donut" || tile.visual === "pie" ? (
          <PieChart>
            {tooltip}
            <Pie
              isAnimationActive={false}
              data={data}
              dataKey="number"
              nameKey="label"
              innerRadius={tile.visual === "donut" ? 58 : 0}
              outerRadius={90}
              paddingAngle={2}
              onClick={(_, i) => data[i] && onDetails(data[i])}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={Object.values(widgetColors)[i % 5]} />
              ))}
            </Pie>
          </PieChart>
        ) : tile.visual === "radar" ? (
          <RadarChart data={data} outerRadius="70%">
            <PolarGrid stroke="var(--relay-border)" />
            <PolarAngleAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--relay-muted)" }} />
            <PolarRadiusAxis tick={{ fontSize: 9 }} />
            {tooltip}
            <Radar
              isAnimationActive={false}
              dataKey="number"
              stroke={color}
              fill={color}
              fillOpacity={0.18}
            />
          </RadarChart>
        ) : tile.visual === "treemap" ? (
          <Treemap
            isAnimationActive={false}
            data={data.map((row) => ({ ...row, name: row.label }))}
            dataKey="number"
            nameKey="name"
            aspectRatio={4 / 3}
            fill={color}
            stroke="var(--relay-surface)"
            onClick={(node) => {
              const row = data.find((r) => r.dimension === node.dimension);
              if (row) onDetails(row);
            }}
          >
            {tooltip}
          </Treemap>
        ) : tile.visual === "combo" ? (
          <ComposedChart data={data}>
            <CartesianGrid stroke="var(--relay-border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} />
            <YAxis yAxisId="value" tick={{ fontSize: 10 }} width={55} />
            <YAxis
              yAxisId="count"
              orientation="right"
              tick={{ fontSize: 10 }}
              width={35}
              allowDecimals={false}
            />
            {tooltip}
            <Bar
              isAnimationActive={false}
              name="Valeur"
              dataKey="number"
              yAxisId="value"
              fill={color}
              fillOpacity={0.3}
              radius={[4, 4, 0, 0]}
            />
            <Line
              isAnimationActive={false}
              name="Fiches"
              dataKey="count"
              yAxisId="count"
              stroke={color}
              dot={{ r: 3 }}
              strokeWidth={2}
            />
          </ComposedChart>
        ) : tile.visual === "area" ? (
          <AreaChart data={data}>
            {axes}
            {tooltip}
            <Area
              isAnimationActive={false}
              dataKey="number"
              stroke={color}
              fill={color}
              fillOpacity={0.12}
              strokeWidth={2}
            />
          </AreaChart>
        ) : tile.visual === "line" ? (
          <LineChart data={data}>
            {axes}
            {tooltip}
            <Line
              isAnimationActive={false}
              dataKey="number"
              stroke={color}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        ) : (
          <BarChart data={data} layout={tile.visual === "bars" ? "vertical" : "horizontal"}>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={tile.visual === "bars"}
              horizontal={tile.visual !== "bars"}
              stroke="var(--relay-border)"
            />
            <XAxis
              type={tile.visual === "bars" ? "number" : "category"}
              dataKey={tile.visual === "bars" ? undefined : "label"}
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type={tile.visual === "bars" ? "category" : "number"}
              dataKey={tile.visual === "bars" ? "label" : undefined}
              width={tile.visual === "bars" ? 105 : 55}
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            {tooltip}
            <Bar
              isAnimationActive={false}
              dataKey="number"
              fill={color}
              radius={4}
              maxBarSize={36}
              onClick={(_, i) => data[i] && onDetails(data[i])}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
      {tile.visual === "combo" && (
        <p className={styles.chartLegend}>
          <i style={{ background: color, opacity: 0.3 }} />
          Valeur · axe gauche <i style={{ background: color }} />
          Fiches · axe droit
        </p>
      )}
    </div>
  );
}
