"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Plus, Inbox, LoaderCircle, Search } from "lucide-react";
import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { editorValues } from "./ui/editor-values";
import {
  EditorDraftScope,
  readDraft,
  writeDraft,
  clearDraft,
  restoredCustomValue,
} from "./ui/editor-draft";
import { str } from "./ui/display";
export { PageHeader, Badge, Avatar, money, date, str } from "./ui/display";
import { DatePicker } from "./ui/date-picker";
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
  description = "Complétez les informations puis enregistrez.",
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  description?: string;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={"dialog-content " + (wide ? "wide" : "") + " " + className}>
          <div className="dialog-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
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
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={"drawer " + className}>
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
export function SearchBox({ value, onChange }: { value: string; onChange: (s: string) => void }) {
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
    | "tel"
    | "number"
    | "date"
    | "datetime-local"
    | "textarea"
    | "select"
    | "checkbox"
    | "json"
    | "custom";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  render?: (initial: unknown, name: string) => ReactNode;
  nullable?: boolean;
};
export function Editor({
  open,
  onClose,
  title,
  fields,
  initial = {},
  onSave,
  busy = false,
  draftKey,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  fields: Field[];
  initial?: Record<string, unknown>;
  onSave: (v: Record<string, unknown>) => Promise<unknown>;
  busy?: boolean;
  draftKey?: string;
}) {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const dirty = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const scope = useContext(EditorDraftScope);
  const storageKey = scope
    ? `relay-draft:${scope}:${draftKey ?? JSON.stringify([title, initial.id ?? "new", fields.map((field) => field.key)])}`
    : null;
  const [restored] = useState(() => readDraft(storageKey));
  const defaults = { ...initial, ...restored };
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current && !inFlight.current) return;
      // Disabled fields are absent from FormData during submission. Keep the
      // complete draft captured before disabling them until the server confirms.
      if (formRef.current && !inFlight.current) writeDraft(storageKey, formRef.current);
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [storageKey]);
  const close = () => {
    if (!inFlight.current) onClose();
  };
  return (
    <Modal open={open} onClose={close} title={title}>
      <form
        ref={formRef}
        onInput={(event) => {
          if (inFlight.current) return;
          dirty.current = true;
          writeDraft(storageKey, event.currentTarget);
        }}
        onChange={(event) => {
          if (inFlight.current) return;
          dirty.current = true;
          writeDraft(storageKey, event.currentTarget);
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || inFlight.current) return;
          inFlight.current = true;
          setSubmitting(true);
          setError("");
          writeDraft(storageKey, e.currentTarget);
          const form = new FormData(e.currentTarget);
          try {
            await onSave(editorValues(form, fields));
            clearDraft(storageKey);
            dirty.current = false;
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Enregistrement impossible");
          } finally {
            inFlight.current = false;
            setSubmitting(false);
          }
        }}
      >
        <fieldset disabled={submitting} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="form-grid">
            {fields.map((f) =>
              f.type === "custom" ? (
                <div className="span-2" key={f.key}>
                  <strong>
                    {f.label}
                    {f.required ? " *" : ""}
                  </strong>
                  {f.render?.(restoredCustomValue(restored?.[f.key], initial[f.key]), f.key)}
                </div>
              ) : (
                <label
                  key={f.key}
                  className={["textarea", "json"].includes(f.type ?? "") ? "span-2" : ""}
                >
                  {f.label}
                  {f.required ? " *" : ""}
                  {f.type === "select" ? (
                    <select name={f.key} defaultValue={str(defaults[f.key])} required={f.required}>
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
                      defaultChecked={restored ? Boolean(restored[f.key]) : Boolean(initial[f.key])}
                    />
                  ) : ["textarea", "json"].includes(f.type ?? "") ? (
                    <textarea
                      name={f.key}
                      rows={f.type === "json" ? 6 : 4}
                      defaultValue={
                        f.type === "json"
                          ? restored && typeof restored[f.key] === "string"
                            ? str(restored[f.key])
                            : JSON.stringify(initial[f.key] ?? [], null, 2)
                          : str(defaults[f.key])
                      }
                      required={f.required}
                      placeholder={f.placeholder}
                    />
                  ) : f.type === "date" || f.type === "datetime-local" ? (
                    <DatePicker
                      name={f.key}
                      label={f.label}
                      withTime={f.type === "datetime-local"}
                      required={f.required}
                      disabled={submitting}
                      onValueChange={(value) => {
                        if (inFlight.current) return;
                        dirty.current = true;
                        if (formRef.current)
                          writeDraft(storageKey, formRef.current, { [f.key]: value });
                      }}
                      defaultValue={
                        f.type === "datetime-local" && defaults[f.key]
                          ? localDateTime(defaults[f.key])
                          : str(defaults[f.key])
                      }
                    />
                  ) : (
                    <input
                      name={f.key}
                      type={f.type ?? "text"}
                      step={f.type === "number" ? "0.01" : undefined}
                      defaultValue={str(defaults[f.key])}
                      required={f.required}
                      placeholder={f.placeholder}
                    />
                  )}
                </label>
              ),
            )}
          </div>
        </fieldset>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="dialog-footer">
          <button type="button" className="button" onClick={close} disabled={submitting}>
            Annuler
          </button>
          <button className="button primary" disabled={busy || submitting}>
            {busy || submitting ? "Enregistrement…" : "Enregistrer"}
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
