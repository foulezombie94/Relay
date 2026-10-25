"use client";
import Link from "next/link";
import { useId, useState } from "react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronRight, Copy, Ellipsis, ExternalLink, Star, type LucideIcon } from "lucide-react";
import styles from "./app-sidebar.module.css";

export type SidebarEntry = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  children?: SidebarEntry[];
};
export function SidebarEntryRow({
  entry,
  path,
  favorite,
  favoriteIds,
  onFavorite,
  close,
  persistPreferences,
}: {
  entry: SidebarEntry;
  path: string;
  favorite: boolean;
  favoriteIds: string[];
  onFavorite: (id: string) => void;
  close: () => void;
  persistPreferences: boolean;
}) {
  const panelId = useId();
  const childActive = entry.children?.some((child) => path === child.href) ?? false;
  const [expanded, setExpanded] = useState(false);
  const [toggled, setToggled] = useState(false);
  const [copyState, setCopyState] = useState("");
  const open = toggled ? expanded : childActive;
  const active =
    path === entry.href || childActive || (entry.id === "lists" && path.startsWith("/app/list-"));
  const Icon = entry.icon;
  return (
    <li className={styles.entry}>
      <div className={styles.entryRow} data-active={active}>
        <Link
          prefetch={persistPreferences ? undefined : false}
          href={entry.href}
          onClick={close}
          className={styles.entryLink}
          aria-current={path === entry.href ? "page" : undefined}
          aria-label={entry.label}
        >
          <Icon size={20} className={entry.children?.length ? styles.branchIcon : undefined} />
          <span>{entry.label}</span>
        </Link>
        {!!entry.children?.length && (
          <button
            type="button"
            className={styles.disclosure}
            aria-label={(open ? "Replier " : "Déplier ") + entry.label}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => {
              setExpanded(!open);
              setToggled(true);
            }}
          >
            <ChevronRight size={12} data-open={open} />
          </button>
        )}
        <Dropdown.Root onOpenChange={() => setCopyState("")}>
          <Dropdown.Trigger
            className={styles.entryMore}
            aria-label={"Actions : " + entry.label}
            title={"Actions : " + entry.label}
          >
            <Ellipsis size={16} />
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content
              className={"sb-dropdown " + styles.actionMenu}
              side="right"
              align="start"
              sideOffset={6}
              collisionPadding={8}
            >
              <Dropdown.Label className="sb-dropdown-label">{entry.label}</Dropdown.Label>
              <Dropdown.Item className="sb-dropdown-item" onSelect={() => onFavorite(entry.id)}>
                <Star size={16} fill={favorite ? "currentColor" : "none"} />
                {favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
              </Dropdown.Item>
              <Dropdown.Item asChild>
                <Link
                  prefetch={persistPreferences ? undefined : false}
                  className="sb-dropdown-item"
                  href={entry.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={16} />
                  Ouvrir dans un nouvel onglet
                </Link>
              </Dropdown.Item>
              <Dropdown.Item
                className="sb-dropdown-item"
                onSelect={async (event) => {
                  event.preventDefault();
                  try {
                    await navigator.clipboard.writeText(
                      new URL(entry.href, window.location.origin).href,
                    );
                    setCopyState("Lien copié");
                  } catch {
                    setCopyState("La copie du lien a échoué");
                  }
                }}
              >
                <Copy size={16} />
                {copyState || "Copier le lien"}
              </Dropdown.Item>
              {copyState && (
                <span role="status" className="sr-only">
                  {copyState}
                </span>
              )}
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      </div>
      {!!entry.children?.length && (
        <ul id={panelId} hidden={!open} className={styles.entryChildren}>
          {entry.children.map((child) => (
            <SidebarEntryRow
              key={child.id}
              entry={child}
              path={path}
              favorite={favoriteIds.includes(child.id)}
              favoriteIds={favoriteIds}
              onFavorite={onFavorite}
              close={close}
              persistPreferences={persistPreferences}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
