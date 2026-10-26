"use client";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { LayoutDashboard, Search, X, Pencil } from "lucide-react";
import styles from "./board.module.css";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const subscribePlatform = () => () => {};
const platformIsMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function matchesWidgetSearch(title: string, search: string) {
  return normalize(title).includes(normalize(search.trim()));
}

type DashboardHeaderProps = {
  title: string;
  search: string;
  onSearch: (value: string) => void;
  children?: ReactNode;
  editing?: boolean;
};
export function DashboardHeader({
  title,
  search,
  onSearch,
  children,
  editing = false,
}: DashboardHeaderProps) {
  const input = useRef<HTMLInputElement>(null);
  const isMac = useSyncExternalStore(subscribePlatform, platformIsMac, () => false);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "k"
      )
        return;
      if (document.querySelector('[aria-modal="true"], [data-relay-presentation]')) return;
      event.preventDefault();
      event.stopPropagation();
      input.current?.focus();
      input.current?.select();
    }
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);
  return (
    <header className={styles.boardHeader}>
      <div className={styles.boardTitle}>
        <LayoutDashboard size={17} />
        <h1>{title}</h1>
        {editing && (
          <span className={styles.editingBadge}>
            <Pencil size={11} /> Mode édition
          </span>
        )}
      </div>
      <label className={styles.boardSearch}>
        <Search size={16} />
        <input
          ref={input}
          type="search"
          aria-label="Rechercher un widget"
          aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
          placeholder="Rechercher un widget…"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
        {search && (
          <button
            type="button"
            aria-label="Effacer la recherche de widgets"
            onClick={() => onSearch("")}
          >
            <X size={14} />
          </button>
        )}
        <kbd>{isMac ? "⌘ K" : "Ctrl+K"}</kbd>
      </label>
      <div className={styles.boardActions}>{children}</div>
    </header>
  );
}

export function DashboardEditNotice({ children }: { children?: ReactNode }) {
  return (
    <div className={styles.editNotice} role="status">
      <Pencil size={17} />
      <div>
        <strong>Mode édition</strong>
        <span>
          Déplacez et configurez vos widgets. Les modifications ne sont pas encore enregistrées.
        </span>
      </div>
      {children}
    </div>
  );
}
