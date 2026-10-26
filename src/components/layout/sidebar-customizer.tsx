"use client";
import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Ellipsis,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  RotateCcw,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import type { SidebarEntry } from "./sidebar-entry";
import {
  defaultSidebarShortcuts,
  moveSidebarItem,
  type SidebarPreferences,
} from "./sidebar-preferences";
import styles from "./sidebar-customizer.module.css";
import { SidebarMenu, SidebarMenuContent } from "./sidebar-menu";

type Section = { id: string; label: string; icon: LucideIcon; entries: SidebarEntry[] };
type Kind = "section" | "shortcut" | "entry";
type DragSource = { kind: Kind; id: string; scope?: string };
export function SidebarCustomizer({
  sections,
  shortcuts,
  preferences,
  onChange,
}: {
  sections: Section[];
  shortcuts: SidebarEntry[];
  preferences: SidebarPreferences;
  onChange: (next: SidebarPreferences) => void;
}) {
  const drag = useRef<DragSource | null>(null);
  const [drop, setDrop] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  function update(next: SidebarPreferences, message: string) {
    onChange(next);
    setNotice(message);
  }
  function move(kind: Kind, id: string, target: string) {
    const key = kind === "section" ? "order" : kind === "shortcut" ? "shortcuts" : "entryOrder";
    update(
      { ...preferences, [key]: moveSidebarItem(preferences[key], id, target) },
      "Ordre mis à jour",
    );
  }
  function start(event: DragEvent, source: DragSource) {
    drag.current = source;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", source.id);
  }
  function dragTarget(kind: Kind, id: string, scope?: string) {
    return {
      onDragOver(event: DragEvent) {
        if (drag.current?.kind === kind && drag.current.scope === scope) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDrop(kind + id);
        }
      },
      onDrop(event: DragEvent) {
        event.preventDefault();
        if (drag.current?.kind === kind && drag.current.scope === scope)
          move(kind, drag.current.id, id);
        drag.current = null;
        setDrop("");
      },
      "data-drop": drop === kind + id,
    };
  }
  function keyboardMove(event: KeyboardEvent, kind: Kind, id: string, ids: string[]) {
    if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const target = ids[ids.indexOf(id) + (event.key === "ArrowUp" ? -1 : 1)];
    if (target) move(kind, id, target);
  }
  function handle(kind: Kind, id: string, label: string, ids: string[], scope?: string) {
    return (
      <button
        type="button"
        className={styles.handle}
        draggable
        aria-label={"Déplacer " + label}
        title="Glisser pour déplacer · Flèches haut et bas"
        onDragStart={(event) => start(event, { kind, id, scope })}
        onDragEnd={() => {
          drag.current = null;
          setDrop("");
        }}
        onKeyDown={(event) => keyboardMove(event, kind, id, ids)}
      >
        <GripVertical size={14} />
      </button>
    );
  }
  function picker(kind: "section" | "shortcut") {
    const source =
      kind === "section"
        ? sections.filter((section) => preferences.hidden.includes(section.id))
        : shortcuts.filter((shortcut) => !preferences.shortcuts.includes(shortcut.id));
    const label = kind === "section" ? "Ajouter une section" : "Ajouter un onglet";
    return (
      <SidebarMenu onOpenChange={() => setQuery("")}>
        <Dropdown.Trigger className={styles.add}>
          <Plus size={16} />
          <span>{label}</span>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <SidebarMenuContent
            className={"sb-dropdown " + styles.picker}
            side="right"
            align="start"
            sideOffset={8}
            collisionPadding={8}
          >
            <label className={styles.search}>
              <Search size={15} />
              <input
                aria-label={"Rechercher une " + (kind === "section" ? "section" : "page")}
                placeholder="Rechercher…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
              />
            </label>
            {source
              .filter((item) =>
                item.label.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")),
              )
              .map((item) => (
                <Dropdown.Item
                  key={item.id}
                  className="sb-dropdown-item"
                  onSelect={() =>
                    update(
                      kind === "section"
                        ? {
                            ...preferences,
                            hidden: preferences.hidden.filter((id) => id !== item.id),
                          }
                        : { ...preferences, shortcuts: [...preferences.shortcuts, item.id] },
                      item.label + " ajouté",
                    )
                  }
                >
                  <item.icon size={16} />
                  <span>{item.label}</span>
                  <Plus size={14} />
                </Dropdown.Item>
              ))}
            {source.length === 0 && (
              <p className={styles.empty}>
                {kind === "section"
                  ? "Toutes les sections sont affichées."
                  : "Tous les onglets sont affichés."}
              </p>
            )}
            {source.length > 0 &&
              !source.some((item) =>
                item.label.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")),
              ) && <p className={styles.empty}>Aucun résultat.</p>}
          </SidebarMenuContent>
        </Dropdown.Portal>
      </SidebarMenu>
    );
  }
  const visibleSections = preferences.order.filter((id) => !preferences.hidden.includes(id));
  return (
    <div className={styles.customizer} role="region" aria-label="Personnaliser la barre latérale">
      <div className={styles.heading}>
        <strong>Personnaliser</strong>
        <span>Organisez votre espace à votre façon.</span>
      </div>
      <div className={styles.label}>Accès rapides</div>
      <ul className={styles.list} aria-label="Ordre des accès rapides">
        {preferences.shortcuts
          .map((id) => shortcuts.find((item) => item.id === id))
          .filter((item) => !!item)
          .map((item) => (
            <li key={item.id} className={styles.row} {...dragTarget("shortcut", item.id)}>
              {handle("shortcut", item.id, item.label, preferences.shortcuts)}
              <item.icon size={18} className={styles.itemIcon} />
              <span className={styles.name}>{item.label}</span>
              <button
                type="button"
                className={styles.remove}
                aria-label={"Masquer l’onglet " + item.label}
                title="Retirer de la barre latérale"
                onClick={() =>
                  update(
                    {
                      ...preferences,
                      shortcuts: preferences.shortcuts.filter((id) => id !== item.id),
                    },
                    item.label + " masqué",
                  )
                }
              >
                <X size={14} />
              </button>
            </li>
          ))}
      </ul>
      {picker("shortcut")}
      <div className={styles.divider} />
      <div className={styles.label}>Sections</div>
      <ul className={styles.list} aria-label="Ordre des sections">
        {visibleSections
          .map((id) => sections.find((section) => section.id === id))
          .filter((section) => !!section)
          .map((section) => {
            const open = expanded.includes(section.id);
            const entryIds = preferences.entryOrder.filter((id) =>
              section.entries.some((entry) => entry.id === id),
            );
            return (
              <li key={section.id} className={styles.section}>
                <div className={styles.row} {...dragTarget("section", section.id)}>
                  {handle("section", section.id, section.label, visibleSections)}
                  <section.icon size={18} className={styles.itemIcon} />
                  <button
                    type="button"
                    className={styles.configure}
                    aria-label={"Configurer " + section.label}
                    aria-expanded={open}
                    aria-controls={"customize-" + section.id}
                    onClick={() =>
                      setExpanded(
                        open
                          ? expanded.filter((id) => id !== section.id)
                          : [...expanded, section.id],
                      )
                    }
                  >
                    <span>{section.label}</span>
                    <ChevronRight size={12} data-open={open} />
                  </button>
                  <SidebarMenu>
                    <Dropdown.Trigger
                      className={styles.more}
                      aria-label={"Options de personnalisation : " + section.label}
                    >
                      <Ellipsis size={16} />
                    </Dropdown.Trigger>
                    <Dropdown.Portal>
                      <SidebarMenuContent
                        className="sb-dropdown"
                        side="right"
                        align="start"
                        sideOffset={6}
                        collisionPadding={8}
                      >
                        <Dropdown.Item
                          className="sb-dropdown-item"
                          disabled={visibleSections.indexOf(section.id) === 0}
                          onSelect={() => {
                            const target = visibleSections[visibleSections.indexOf(section.id) - 1];
                            if (target) move("section", section.id, target);
                          }}
                        >
                          <ArrowUp size={16} />
                          Remonter
                        </Dropdown.Item>
                        <Dropdown.Item
                          className="sb-dropdown-item"
                          disabled={
                            visibleSections.indexOf(section.id) === visibleSections.length - 1
                          }
                          onSelect={() => {
                            const target = visibleSections[visibleSections.indexOf(section.id) + 1];
                            if (target) move("section", section.id, target);
                          }}
                        >
                          <ArrowDown size={16} />
                          Descendre
                        </Dropdown.Item>
                        <Dropdown.Separator className="sb-separator" />
                        <Dropdown.Item
                          className="sb-dropdown-item"
                          onSelect={() =>
                            update(
                              {
                                ...preferences,
                                hiddenEntries: preferences.hiddenEntries.filter(
                                  (id) => !entryIds.includes(id),
                                ),
                              },
                              "Tous les onglets affichés",
                            )
                          }
                        >
                          <Eye size={16} />
                          Afficher tous les onglets
                        </Dropdown.Item>
                      </SidebarMenuContent>
                    </Dropdown.Portal>
                  </SidebarMenu>
                  <button
                    type="button"
                    className={styles.remove}
                    aria-label={"Masquer la section " + section.label}
                    title="Retirer de la barre latérale"
                    onClick={() =>
                      update(
                        { ...preferences, hidden: [...preferences.hidden, section.id] },
                        section.label + " masquée",
                      )
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
                <ul
                  id={"customize-" + section.id}
                  className={styles.entries}
                  hidden={!open}
                  aria-label={"Onglets de " + section.label}
                >
                  {entryIds
                    .map((id) => section.entries.find((entry) => entry.id === id)!)
                    .map((entry) => {
                      const hidden = preferences.hiddenEntries.includes(entry.id);
                      return (
                        <li
                          key={entry.id}
                          className={styles.row}
                          data-muted={hidden}
                          {...dragTarget("entry", entry.id, section.id)}
                        >
                          {handle("entry", entry.id, entry.label, entryIds, section.id)}
                          <entry.icon size={16} className={styles.itemIcon} />
                          <span className={styles.name}>{entry.label}</span>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={!hidden}
                            aria-label={"Afficher " + entry.label}
                            title={hidden ? "Afficher" : "Masquer"}
                            className={styles.visibility}
                            onClick={() =>
                              update(
                                {
                                  ...preferences,
                                  hiddenEntries: hidden
                                    ? preferences.hiddenEntries.filter((id) => id !== entry.id)
                                    : [...preferences.hiddenEntries, entry.id],
                                },
                                entry.label + (hidden ? " affiché" : " masqué"),
                              )
                            }
                          >
                            {hidden ? <EyeOff size={15} /> : <Check size={15} />}
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </li>
            );
          })}
      </ul>
      {picker("section")}
      <button
        type="button"
        className={styles.reset}
        onClick={() =>
          update(
            {
              ...preferences,
              order: sections.map((section) => section.id),
              hidden: [],
              shortcuts: defaultSidebarShortcuts.filter((id) =>
                shortcuts.some((shortcut) => shortcut.id === id),
              ),
              entryOrder: sections.flatMap((section) => section.entries.map((entry) => entry.id)),
              hiddenEntries: [],
            },
            "Disposition réinitialisée",
          )
        }
      >
        <RotateCcw size={14} />
        Rétablir la disposition
      </button>
      <span role="status" className="sr-only">
        {notice}
      </span>
    </div>
  );
}
