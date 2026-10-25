"use client";
import { useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  FileText,
  ArrowUpRight,
  AtSign,
  Text,
  Plus,
  ChevronDown,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  Copy,
} from "lucide-react";
import type { CrmRecord } from "@/lib/domain/types";
import type { ViewConfig } from "@/lib/domain/views";
import { str } from "../ui/display";
import { contactValue, type ContactColumn } from "./contacts-model";
import styles from "./contacts.module.css";
function ContactCell({
  record,
  column,
  readonly,
  onSave,
  onOpen,
}: {
  record: CrmRecord;
  column: ContactColumn;
  readonly: boolean;
  onSave: (record: CrmRecord, column: ContactColumn, value: unknown) => Promise<void>;
  onOpen: (record: CrmRecord) => void;
}) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(""),
    [checked, setChecked] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const value = contactValue(record, column.key);
  const text =
    column.type === "boolean"
      ? value === true
        ? "Oui"
        : value === false
          ? "Non"
          : ""
      : str(value);
  const simple = ["text", "email", "phone", "url", "number", "select", "date", "boolean"].includes(
    column.type,
  );
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (next) {
          setDraft(str(value));
          setChecked(value === true);
          setError("");
        }
      }}
    >
      <Popover.Trigger
        type="button"
        className={styles.cellButton}
        aria-label={`${column.label} de ${record.display_name}`}
        disabled={readonly}
      >
        {column.key === "display_name" && <FileText size={17} />}
        <span
          className={column.type === "select" && text ? styles.tag : undefined}
          data-tone={column.options ? Math.max(0, column.options.indexOf(text)) % 4 : 0}
        >
          {text || <span className={styles.emptyCell}>—</span>}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.cellEditor}
          align="start"
          sideOffset={0}
          collisionPadding={12}
          aria-label={`Modifier ${column.label}`}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              setBusy(true);
              setError("");
              try {
                await onSave(
                  record,
                  column,
                  column.type === "boolean"
                    ? checked
                    : column.type === "number"
                      ? draft === ""
                        ? null
                        : Number(draft)
                      : column.attribute && draft === ""
                        ? null
                        : draft,
                );
                setOpen(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Enregistrement impossible.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <strong>{column.label}</strong>
            {!simple ? (
              <button
                type="button"
                className="button small"
                onClick={() => {
                  setOpen(false);
                  onOpen(record);
                }}
              >
                Modifier dans la fiche
              </button>
            ) : column.type === "boolean" ? (
              <label>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => setChecked(event.target.checked)}
                  disabled={busy}
                />
                Oui
              </label>
            ) : column.type === "select" ? (
              <select
                aria-label={`Valeur de ${column.label}`}
                value={draft}
                disabled={busy}
                onChange={(event) => setDraft(event.target.value)}
              >
                <option value="">Non renseigné</option>
                {column.options?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-label={`Valeur de ${column.label}`}
                type={
                  column.type === "email"
                    ? "email"
                    : column.type === "number"
                      ? "number"
                      : column.type === "date"
                        ? "date"
                        : column.type === "phone"
                          ? "tel"
                          : "text"
                }
                maxLength={
                  column.key === "display_name" ? 200 : column.key === "email" ? 320 : 2000
                }
                required={column.key === "display_name"}
                value={draft}
                disabled={busy}
                onChange={(event) => setDraft(event.target.value)}
              />
            )}
            {error && <p role="alert">{error}</p>}
            {simple && (
              <footer>
                <button
                  type="button"
                  className="button small ghost"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                >
                  Annuler
                </button>
                <button type="submit" className="button small primary" disabled={busy}>
                  {busy ? "Enregistrement…" : "Enregistrer"}
                </button>
              </footer>
            )}
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
export function ContactsTable({
  rows,
  columns,
  config,
  onChange,
  onOpen,
  onCreate,
  onAddProperty,
  onEditProperty,
  onSave,
  readonly = false,
}: {
  rows: CrmRecord[];
  columns: ContactColumn[];
  config: ViewConfig;
  onChange: (value: ViewConfig) => void;
  onOpen: (record: CrmRecord) => void;
  onCreate: () => void;
  onAddProperty?: () => void;
  onEditProperty?: (column: ContactColumn) => void;
  onSave: (record: CrmRecord, column: ContactColumn, value: unknown) => Promise<void>;
  readonly?: boolean;
}) {
  const openingEditor = useRef(false);
  const [selected, setSelected] = useState<string[]>([]),
    [copyStatus, setCopyStatus] = useState("");
  const visible = config.columns
    .map((key) => columns.find((column) => column.key === key))
    .filter((column) => !!column);
  const selectedRows = rows.filter((row) => selected.includes(row.id));
  const all = rows.length > 0 && selectedRows.length === rows.length;
  function move(key: string, step: number) {
    const next = [...config.columns],
      i = next.indexOf(key),
      j = i + step;
    if (i < 0 || j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...config, columns: next });
  }
  return (
    <div>
      {selectedRows.length > 0 && (
        <div className={styles.selection}>
          <strong>
            {selectedRows.length} sélectionné{selectedRows.length > 1 ? "s" : ""}
          </strong>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  selectedRows
                    .map((row) => row.email)
                    .filter(Boolean)
                    .join("\n"),
                );
                setCopyStatus("Adresses copiées");
              } catch {
                setCopyStatus("Copie indisponible dans ce navigateur.");
              }
            }}
          >
            <Copy size={14} />
            Copier les e-mails
          </button>
          <button
            type="button"
            aria-label="Désélectionner les contacts"
            onClick={() => setSelected([])}
          >
            <X size={14} />
          </button>
          <span role="status">{copyStatus}</span>
        </div>
      )}
      <div className={styles.tableScroll}>
        <table className={styles.table} aria-label="Répertoire des contacts">
          <colgroup>
            <col style={{ width: 32 }} />
            {visible.map((column) => (
              <col key={column.key} style={{ width: column.key === "display_name" ? 280 : 200 }} />
            ))}
            <col style={{ width: 40 }} />
          </colgroup>
          <thead>
            <tr>
              <th className={styles.selectCell}>
                <input
                  type="checkbox"
                  aria-label="Sélectionner tous les contacts de cette page"
                  checked={all}
                  onChange={(event) =>
                    setSelected(event.target.checked ? rows.map((row) => row.id) : [])
                  }
                />
              </th>
              {visible.map((column, index) => (
                <th scope="col" key={column.key}>
                  <Popover.Root>
                    <Popover.Trigger
                      type="button"
                      className={styles.columnButton}
                      aria-label={`Propriété ${column.label}`}
                    >
                      {column.key === "email" ? <AtSign size={16} /> : <Text size={16} />}
                      <span>{column.label}</span>
                      <ChevronDown size={12} />
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        className={styles.menu}
                        align="start"
                        sideOffset={4}
                        onCloseAutoFocus={(event) => {
                          if (openingEditor.current) {
                            event.preventDefault();
                            openingEditor.current = false;
                          }
                        }}
                      >
                        <strong>{column.label}</strong>
                        <small>{column.type}</small>
                        {column.key === "display_name" && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                onChange({ ...config, sort: "display_name", direction: "asc" })
                              }
                            >
                              Trier par ordre croissant
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onChange({ ...config, sort: "display_name", direction: "desc" })
                              }
                            >
                              Trier par ordre décroissant
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          disabled={config.columns.length <= 1}
                          onClick={() =>
                            onChange({
                              ...config,
                              columns: config.columns.filter((key) => key !== column.key),
                            })
                          }
                        >
                          <EyeOff size={14} />
                          Masquer cette propriété
                        </button>
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => move(column.key, -1)}
                        >
                          <ArrowLeft size={14} />
                          Déplacer à gauche
                        </button>
                        <button
                          type="button"
                          disabled={index === visible.length - 1}
                          onClick={() => move(column.key, 1)}
                        >
                          <ArrowRight size={14} />
                          Déplacer à droite
                        </button>
                        {column.attribute && onEditProperty && (
                          <Popover.Close asChild>
                            <button
                              type="button"
                              onClick={() => {
                                openingEditor.current = true;
                                onEditProperty(column);
                              }}
                            >
                              Modifier la propriété
                            </button>
                          </Popover.Close>
                        )}
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                </th>
              ))}
              <th>
                <Popover.Root>
                  <Popover.Trigger
                    type="button"
                    className={styles.icon}
                    aria-label="Ajouter ou afficher une propriété"
                  >
                    <Plus size={16} />
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      className={styles.menu}
                      align="end"
                      sideOffset={5}
                      onCloseAutoFocus={(event) => {
                        if (openingEditor.current) {
                          event.preventDefault();
                          openingEditor.current = false;
                        }
                      }}
                    >
                      <strong>Propriétés des contacts</strong>
                      {columns.map((column) => (
                        <button
                          type="button"
                          key={column.key}
                          disabled={
                            config.columns.includes(column.key) && config.columns.length <= 1
                          }
                          onClick={() =>
                            onChange({
                              ...config,
                              columns: config.columns.includes(column.key)
                                ? config.columns.filter((key) => key !== column.key)
                                : [...config.columns, column.key],
                            })
                          }
                        >
                          {column.label}
                          {config.columns.includes(column.key) && <Check size={14} />}
                        </button>
                      ))}
                      {onAddProperty && (
                        <>
                          <hr />
                          <Popover.Close asChild>
                            <button
                              type="button"
                              onClick={() => {
                                openingEditor.current = true;
                                onAddProperty();
                              }}
                            >
                              <Plus size={14} />
                              Nouvelle propriété
                            </button>
                          </Popover.Close>
                        </>
                      )}
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((record) => (
              <tr key={record.id} data-selected={selected.includes(record.id)}>
                <td className={styles.selectCell}>
                  <input
                    type="checkbox"
                    aria-label={`Sélectionner ${record.display_name}`}
                    checked={selected.includes(record.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, record.id]
                          : current.filter((id) => id !== record.id),
                      )
                    }
                  />
                </td>
                {visible.map((column) => (
                  <td key={column.key}>
                    <div className={styles.cell}>
                      <ContactCell
                        key={record.id + ":" + column.key + ":" + String(record.version)}
                        record={record}
                        column={column}
                        readonly={readonly || !!record.merged_into}
                        onSave={onSave}
                        onOpen={onOpen}
                      />
                      {column.key === "display_name" && (
                        <button
                          type="button"
                          className={styles.openRecord}
                          aria-label={`Ouvrir la fiche de ${record.display_name}`}
                          onClick={() => onOpen(record)}
                        >
                          <ArrowUpRight size={14} />
                          <span>Ouvrir</span>
                        </button>
                      )}
                    </div>
                  </td>
                ))}
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className={styles.newRow} disabled={readonly} onClick={onCreate}>
        <Plus size={16} />
        Nouveau contact
      </button>
    </div>
  );
}
