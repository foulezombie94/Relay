import type { ReactNode } from "react";
import { statusLabels } from "@/lib/domain/types";
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="header-actions">{action}</div>
    </header>
  );
}
export function Badge({ value }: { value: unknown }) {
  const s = String(value ?? "");
  return (
    <span
      className={
        "badge " +
        (["Gagné", "done", "approved", "completed", "confirmed", "connected"].includes(s)
          ? "green"
          : ["Perdu", "cancelled", "failed", "error"].includes(s)
            ? "red"
            : "blue")
      }
    >
      <i />
      {statusLabels[s] ?? s}
    </span>
  );
}
export function Avatar({ name }: { name: string }) {
  const hue = [217, 168, 277, 31, 340, 193][[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % 6];
  return (
    <span
      className="avatar"
      style={{
        background: "hsl(" + hue + " 55% 94%)",
        color: "hsl(" + hue + " 45% 38%)",
      }}
    >
      {name
        .split(" ")
        .map((v) => v[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()}
    </span>
  );
}
export const money = (v: unknown, c = "EUR") =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: c,
    maximumFractionDigits: 0,
  }).format(Number(v) || 0);
export const date = (v: unknown) =>
  v
    ? new Date(String(v)).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
export const str = (v: unknown) =>
  v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
