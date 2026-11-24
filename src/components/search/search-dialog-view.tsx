"use client";
import { useId, useRef, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Search,
  FileText,
  ArrowUpRight,
  PanelRight,
  SlidersHorizontal,
  X,
  Plus,
  LayoutDashboard,
  Building2,
  User,
  Handshake,
  ListTodo,
  StickyNote,
  CalendarDays,
  Sparkles,
  Columns3,
  Globe,
  Settings,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { searchScopes, type SearchEntry, type SearchIcon } from "./search-model";

const icons: Record<SearchIcon, LucideIcon> = {
  plus: Plus,
  dashboard: LayoutDashboard,
  company: Building2,
  person: User,
  deal: Handshake,
  task: ListTodo,
  note: StickyNote,
  meeting: CalendarDays,
  assistant: Sparkles,
  pipeline: Columns3,
  portal: Globe,
  settings: Settings,
  trash: Trash2,
  result: FileText,
};
const commandGroups = new Set(["Actions", "Aller à"]);
import styles from "./search-dialog.module.css";
export function SearchDialogView({
  open,
  onClose,
  workspaceName,
  term,
  onTerm,
  scope,
  onScope,
  entries,
  loading = false,
  error,
  prefetch = true,
}: {
  open: boolean;
  onClose: () => void;
  workspaceName: string;
  term: string;
  onTerm: (term: string) => void;
  scope: string;
  onScope: (scope: string) => void;
  entries: SearchEntry[];
  loading?: boolean;
  error?: string;
  prefetch?: boolean;
}) {
  const [preview, setPreview] = useState(true),
    [filters, setFilters] = useState(false);
  const [selected, setSelected] = useState("");
  const refs = useRef<(HTMLAnchorElement | null)[]>([]),
    id = useId();
  const available =
    error || loading ? entries.filter((e) => commandGroups.has(e.group ?? "")) : entries;
  const current = available.find((entry) => entry.id === selected) ?? available[0];
  function move(delta: number) {
    if (!available.length) return;
    const index = Math.max(
      0,
      available.findIndex((entry) => entry.id === current?.id),
    );
    const next = (index + delta + available.length) % available.length;
    setSelected(available[next].id);
    refs.current[next]?.scrollIntoView?.({ block: "nearest" });
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.dialog}
          data-preview={preview}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              move(event.key === "ArrowDown" ? 1 : -1);
            }
          }}
        >
          <Dialog.Title className="sr-only">Rechercher dans {workspaceName}</Dialog.Title>
          <Dialog.Description className="sr-only">
            Recherchez vos fiches et votre contexte CRM, puis ouvrez un résultat.
          </Dialog.Description>
          <div className={styles.top}>
            <label className={styles.searchRow}>
              <Search size={20} />
              <input
                type="search"
                aria-label="Rechercher dans votre espace"
                placeholder={`Rechercher dans ${workspaceName}…`}
                value={term}
                onChange={(event) => {
                  onTerm(event.target.value);
                  setSelected("");
                }}
                role="combobox"
                aria-expanded="true"
                aria-controls={id}
                aria-activedescendant={current ? id + "-" + available.indexOf(current) : undefined}
                autoComplete="off"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && current && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    refs.current[available.indexOf(current)]?.click();
                  }
                }}
              />
            </label>
            <button
              type="button"
              className={styles.icon}
              aria-label={preview ? "Réduire la recherche" : "Agrandir la recherche"}
              title={
                preview
                  ? "Réduire la recherche et masquer l’aperçu"
                  : "Agrandir la recherche et afficher l’aperçu"
              }
              aria-pressed={preview}
              onClick={() => setPreview(!preview)}
            >
              <PanelRight size={18} />
            </button>
            <button
              type="button"
              className={styles.icon}
              aria-label="Filtres de recherche"
              aria-expanded={filters}
              onClick={() => setFilters(!filters)}
            >
              <SlidersHorizontal size={17} />
            </button>
            <Dialog.Close className={styles.icon} aria-label="Fermer la recherche">
              <X size={17} />
            </Dialog.Close>
          </div>
          {filters && (
            <div className={styles.filters} role="group" aria-label="Périmètre de recherche">
              {Object.entries({ all: "Tout", ...searchScopes }).map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={scope === key}
                  onClick={() => {
                    onScope(key);
                    setSelected("");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className={styles.content} data-preview={preview}>
            <div className={styles.results}>
              <div id={id} role="listbox" aria-label="Actions et résultats">
                {available.map((entry, index) => {
                  const group = entry.group ?? entry.category;
                  const Icon = icons[entry.icon ?? "result"];
                  const startsGroup =
                    index === 0 ||
                    (available[index - 1].group ?? available[index - 1].category) !== group;
                  return (
                    <div key={entry.id} role="presentation">
                      {startsGroup && (
                        <p className={styles.heading} role="presentation">
                          {group}
                        </p>
                      )}
                      <Link
                        id={id + "-" + index}
                        href={entry.href}
                        prefetch={prefetch ? undefined : false}
                        ref={(element) => {
                          refs.current[index] = element;
                        }}
                        className={styles.result}
                        role="option"
                        aria-selected={current?.id === entry.id}
                        onMouseEnter={() => setSelected(entry.id)}
                        onFocus={() => setSelected(entry.id)}
                        onClick={(event) => {
                          if (!event.ctrlKey && !event.metaKey && !event.shiftKey) onClose();
                        }}
                      >
                        <Icon size={18} />
                        <span>
                          <strong>{entry.title}</strong>
                          <small>
                            {entry.category}
                            {entry.private ? " · Votre note privée" : ""}
                          </small>
                        </span>
                        <ArrowUpRight size={14} />
                      </Link>
                    </div>
                  );
                })}
              </div>
              {error ? (
                <p className={styles.message} role="alert">
                  {error}
                </p>
              ) : loading ? (
                <p className={styles.message} role="status">
                  Recherche en cours…
                </p>
              ) : (
                !available.length && (
                  <p className={styles.message}>
                    Aucun résultat accessible. Essayez une autre recherche.
                  </p>
                )
              )}
            </div>
            {preview && (
              <aside className={styles.preview} aria-label="Aperçu du résultat">
                {current ? (
                  <>
                    <div className={styles.previewCover}>
                      {(() => {
                        const Icon = icons[current.icon ?? "result"];
                        return <Icon size={28} />;
                      })()}
                    </div>
                    <div className={styles.previewBody}>
                      <small>
                        {current.category}
                        {current.private ? " · Votre note privée" : ""}
                      </small>
                      <h2>{current.title}</h2>
                      <p>{current.excerpt || "Ouvrez cet élément pour consulter son contenu."}</p>
                      <Link
                        className="button small"
                        href={current.href}
                        prefetch={prefetch ? undefined : false}
                        onClick={onClose}
                      >
                        Ouvrir <ArrowUpRight size={14} />
                      </Link>
                    </div>
                  </>
                ) : (
                  <p className={styles.message}>
                    Sélectionnez un résultat pour afficher son aperçu.
                  </p>
                )}
              </aside>
            )}
          </div>
          <footer className={styles.footer}>
            <span>↑ ↓ Parcourir</span>
            <span>↵ Ouvrir</span>
            <span>Échap Fermer</span>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
