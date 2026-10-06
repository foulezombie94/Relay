"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Plus, Inbox, LoaderCircle, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { statusLabels } from "@/lib/domain/types";
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={"dialog-content " + (wide ? "wide" : "")}>
          <div className="dialog-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                Complétez les informations puis enregistrez.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Fermer">
              <X size={18} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="drawer">
          <div className="drawer-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Description className="sr-only">
              Détails et contexte de la fiche
            </Dialog.Description>
            <Dialog.Close className="icon-button" aria-label="Fermer">
              <X size={18} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
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
export function Empty({
  title = "Rien ici pour le moment",
  description = "Ajoutez votre premier élément pour commencer.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={19} />
      Chargement…
    </div>
  );
}
export function ErrorMessage({ error }: { error: Error | null }) {
  return error ? (
    <div className="alert error" role="alert">
      {error.message}
    </div>
  ) : null;
}
export function Badge({ value }: { value: unknown }) {
  const s = String(value ?? "");
  return (
    <span
      className={
        "badge " +
        ([
          "Gagné",
          "done",
          "approved",
          "completed",
          "confirmed",
          "connected",
        ].includes(s)
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
  const hue = [217, 168, 277, 31, 340, 193][
    [...name].reduce((s, c) => s + c.charCodeAt(0), 0) % 6
  ];
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
export function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <div className="search-box">
      <Search size={16} />
      <input
        aria-label="Rechercher"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Rechercher…"
      />
    </div>
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
  v === null || v === undefined
    ? ""
    : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);
function localDateTime(value: unknown) {
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes())
  );
}
export type Field = {
  key: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "number"
    | "date"
    | "datetime-local"
    | "textarea"
    | "select"
    | "checkbox"
    | "json";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
};
export function Editor({
  open,
  onClose,
  title,
  fields,
  initial = {},
  onSave,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  fields: Field[];
  initial?: Record<string, unknown>;
  onSave: (v: Record<string, unknown>) => Promise<unknown>;
  busy?: boolean;
}) {
  const [error, setError] = useState("");
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const form = new FormData(e.currentTarget);
          const values: Record<string, unknown> = {};
          try {
            for (const f of fields) {
              const v = String(form.get(f.key) ?? "");
              if (f.type === "checkbox") values[f.key] = form.has(f.key);
              else if (f.type === "json") values[f.key] = JSON.parse(v || "[]");
              else if (f.type === "number")
                values[f.key] = v === "" ? 0 : Number(v);
              else if (f.type === "datetime-local")
                values[f.key] = v ? new Date(v).toISOString() : null;
              else if (v !== "" || f.required) values[f.key] = v;
              else if (f.type === "date") values[f.key] = null;
            }
            await onSave(values);
            onClose();
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Enregistrement impossible",
            );
          }
        }}
      >
        <div className="form-grid">
          {fields.map((f) => (
            <label
              key={f.key}
              className={
                ["textarea", "json"].includes(f.type ?? "") ? "span-2" : ""
              }
            >
              {f.label}
              {f.required ? " *" : ""}
              {f.type === "select" ? (
                <select
                  name={f.key}
                  defaultValue={str(initial[f.key])}
                  required={f.required}
                >
                  <option value="">Choisir…</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "checkbox" ? (
                <input
                  type="checkbox"
                  name={f.key}
                  defaultChecked={Boolean(initial[f.key])}
                />
              ) : ["textarea", "json"].includes(f.type ?? "") ? (
                <textarea
                  name={f.key}
                  rows={f.type === "json" ? 6 : 4}
                  defaultValue={
                    f.type === "json"
                      ? JSON.stringify(initial[f.key] ?? [], null, 2)
                      : str(initial[f.key])
                  }
                  required={f.required}
                  placeholder={f.placeholder}
                />
              ) : (
                <input
                  name={f.key}
                  type={f.type ?? "text"}
                  step={f.type === "number" ? "0.01" : undefined}
                  defaultValue={
                    f.type === "datetime-local" && initial[f.key]
                      ? localDateTime(initial[f.key])
                      : str(initial[f.key])
                  }
                  required={f.required}
                  placeholder={f.placeholder}
                />
              )}
            </label>
          ))}
        </div>
        {error && <div className="alert error">{error}</div>}
        <div className="dialog-footer">
          <button type="button" className="button" onClick={onClose}>
            Annuler
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function AddButton({
  onClick,
  label = "Ajouter",
  disabled = false,
}: {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button className="button primary" onClick={onClick} disabled={disabled}>
      <Plus size={16} />
      {label}
    </button>
  );
}
