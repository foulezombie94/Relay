"use client";
import Link from "next/link";
import type { Workspace, ObjectDefinition } from "@/lib/domain/types";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import styles from "./app-sidebar.module.css";
import { SidebarEntryRow, type SidebarEntry } from "./sidebar-entry";
import { SidebarCustomizer } from "./sidebar-customizer";
import { readSidebarPreferences, type SidebarPreferences } from "./sidebar-preferences";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  Building2,
  Users,
  Layers,
  CheckSquare,
  MessageSquare,
  Video,
  BarChart3,
  Sparkles,
  Workflow,
  List,
  Handshake,
  TriangleAlert,
  FolderKanban,
  Globe,
  Plug,
  Settings,
  Search,
  Home,
  Inbox,
  SquarePen,
  LayoutGrid,
  LogOut,
  Box,
  ListChecks,
  Check,
  CircleHelp,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Plus,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  ChevronsUpDown,
  SlidersHorizontal,
} from "lucide-react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
function subscribePlatform() {
  return () => {};
}
function platformIsMac() {
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}
const groups = [
  {
    id: "crm",
    label: "CRM",
    icon: Building2,
    items: [
      ["companies", "Entreprises", Building2],
      ["people", "Personnes", Users],
      ["deals", "Opportunités", Layers],
      ["lists", "Listes", List],
      ["tasks", "Tâches", CheckSquare],
    ],
  },
  {
    id: "communication",
    label: "Communication",
    icon: MessageSquare,
    items: [
      ["communications", "Messages", MessageSquare],
      ["meetings", "Réunions", Video],
      ["notes", "Notes", MessageSquare],
      ["sequences", "Séquences", ListChecks],
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    icon: Sparkles,
    items: [["quality", "Qualité des données", TriangleAlert]],
  },
  {
    id: "realisation",
    label: "Réalisation",
    icon: Handshake,
    items: [
      ["commitments", "Engagements", Handshake],
      ["handovers", "Réalisation", FolderKanban],
      ["conflicts", "Contradictions", TriangleAlert],
      ["portals", "Portails clients", Globe],
    ],
  },
  {
    id: "automatisation",
    label: "Automatisation",
    icon: Workflow,
    items: [
      ["workflows", "Automatisations", Workflow],
      ["playbooks", "Modèles de processus", FolderKanban],
    ],
  },
  {
    id: "analyse",
    label: "Analyse",
    icon: BarChart3,
    items: [["reports", "Rapports", BarChart3]],
  },
] as const;
const shortcutEntries: SidebarEntry[] = [
  { id: "dashboard", label: "Dashboard", href: "/app/dashboard", icon: Home },
  { id: "assistant", label: "Ask Zyliad", href: "/app/assistant", icon: Sparkles },
  { id: "priorities", label: "À traiter", href: "/app/priorities", icon: CheckSquare },
];
function itemActive(slug: string, path: string) {
  return (
    path === "/app/" + slug ||
    (slug === "lists" && path.startsWith("/app/list-")) ||
    (slug === "deals" && path === "/app/pipelines") ||
    (slug === "communications" && path === "/app/email-templates")
  );
}
function currentGroup(path: string) {
  if (path.startsWith("/app/object-")) return "crm";
  return groups.find((group) => group.items.some(([slug]) => itemActive(slug, path)))?.id;
}
export function AppSidebarView({
  workspace,
  workspaces,
  switchWorkspace,
  objects,
  user,
  path,
  onSignOut,
  onSearch,
  persistPreferences = true,
}: {
  workspace: Workspace;
  workspaces: Workspace[];
  switchWorkspace: (id: string) => void;
  objects: ObjectDefinition[];
  user: { id: string; email?: string };
  path: string;
  onSignOut: () => void | Promise<void>;
  onSearch?: () => void;
  persistPreferences?: boolean;
}) {
  const { setOpenMobile, isMobile } = useSidebar();
  const searchRef = useRef<HTMLAnchorElement>(null);
  const isMac = useSyncExternalStore(subscribePlatform, platformIsMac, () => false);
  const searchShortcutLabel = isMac ? "⌘ K" : "Ctrl+K";
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const preferenceKey = "relay_nav_groups:" + user.id;
  const [customizing, setCustomizing] = useState(false);
  const [preferences, setPreferences] = useState<SidebarPreferences>(() =>
    readSidebarPreferences(
      null,
      groups.map((g) => g.id),
      [],
    ),
  );
  const entries: SidebarEntry[] = groups.flatMap((group) =>
    group.items.map(([id, label, icon]) => ({
      id,
      label,
      icon,
      href: "/app/" + id,
      children:
        id === "deals"
          ? [{ id: "pipelines", label: "Pipelines", icon: Layers, href: "/app/pipelines" }]
          : id === "communications"
            ? [
                {
                  id: "email-templates",
                  label: "Modèles email",
                  icon: MessageSquare,
                  href: "/app/email-templates",
                },
              ]
            : undefined,
    })),
  );
  entries.push(
    ...objects
      .filter((o) => !o.standard)
      .map((o) => ({
        id: "object-" + o.slug,
        label: o.name,
        href: "/app/object-" + o.slug,
        icon: Box,
      })),
  );
  const allEntries = entries.flatMap((entry) => [entry, ...(entry.children ?? [])]);
  const catalog = allEntries.map((entry) => entry.id).join("|");
  const shortcutCatalog = [...shortcutEntries, ...allEntries];
  const quickEntries = preferences.shortcuts
    .map((id) => shortcutCatalog.find((entry) => entry.id === id))
    .filter((entry) => !!entry);
  const navigationKey = "relay_nav_preferences:" + user.id + ":" + workspace.id;
  useEffect(() => {
    let raw: string | null = null;
    try {
      if (persistPreferences) raw = localStorage.getItem(navigationKey);
    } catch {
      /* Storage is optional. */
    }
    // Restore only IDs from the current workspace's navigation catalog.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreferences(
      readSidebarPreferences(
        raw,
        groups.map((g) => g.id),
        catalog.split("|"),
        [...shortcutEntries.map((entry) => entry.id), ...catalog.split("|")],
      ),
    );
  }, [navigationKey, persistPreferences, catalog]);
  function savePreferences(next: SidebarPreferences) {
    setPreferences(next);
    try {
      if (persistPreferences) localStorage.setItem(navigationKey, JSON.stringify(next));
    } catch {
      /* Keep changes in memory when storage is blocked. */
    }
  }
  function toggleFavorite(id: string) {
    savePreferences({
      ...preferences,
      favorites: preferences.favorites.includes(id)
        ? preferences.favorites.filter((value) => value !== id)
        : [...preferences.favorites, id],
    });
  }
  function moveGroup(id: string, delta: number) {
    const order = [...preferences.order];
    const index = order.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    savePreferences({ ...preferences, order });
  }
  function setGroupOpen(id: string, open: boolean) {
    const next = { ...expanded, [id]: open };
    setExpanded(next);
    try {
      if (persistPreferences) localStorage.setItem(preferenceKey, JSON.stringify(next));
    } catch {
      /* Navigation remains usable without storage. */
    }
  }
  function setAllGroups(open: boolean) {
    const next = Object.fromEntries(
      [...groups.map((group) => group.id), "favorites"].map((id) => [id, open]),
    );
    setExpanded(next);
    try {
      if (persistPreferences) localStorage.setItem(preferenceKey, JSON.stringify(next));
    } catch {
      /* Navigation remains usable without storage. */
    }
  }
  function renderEntry(entry: SidebarEntry) {
    return (
      <SidebarEntryRow
        key={entry.id}
        entry={{
          ...entry,
          children: entry.children?.filter(
            (child) => !preferences.hiddenEntries.includes(child.id),
          ),
        }}
        path={path}
        favorite={preferences.favorites.includes(entry.id)}
        favoriteIds={preferences.favorites}
        onFavorite={toggleFavorite}
        close={close}
        persistPreferences={persistPreferences}
      />
    );
  }
  useEffect(() => {
    if (!persistPreferences && !onSearch) return;
    function searchShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          target.closest('input,textarea,select,[contenteditable="true"]')
        )
          return;
        event.preventDefault();
        searchRef.current?.click();
      }
    }
    window.addEventListener("keydown", searchShortcut);
    return () => window.removeEventListener("keydown", searchShortcut);
  }, [persistPreferences, onSearch]);
  useEffect(() => {
    if (!persistPreferences) return;
    const saved: Record<string, boolean> = {};
    try {
      const value: unknown = JSON.parse(
        persistPreferences ? (localStorage.getItem(preferenceKey) ?? "{}") : "{}",
      );
      if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const id of [...groups.map((group) => group.id), "favorites"]) {
          const open = (value as Record<string, unknown>)[id];
          if (typeof open === "boolean") saved[id] = open;
        }
      }
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
    const active = currentGroup(path);
    // Restore navigation preferences from external browser storage after navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpanded({ ...saved, ...(active ? { [active]: true } : {}) });
  }, [path, preferenceKey, persistPreferences]);
  useEffect(() => {
    // Keep the mobile navigation closed when the route changes.
    setOpenMobile(false);
  }, [path, setOpenMobile]);
  function close() {
    setOpenMobile(false);
  }
  return (
    <Sidebar collapsible="offcanvas" className={styles.sidebar}>
      <SidebarHeader>
        <div className={styles.toolbar}>
          <SidebarTrigger />
          <div className={styles.toolbarActions}>
            <Link
              prefetch={persistPreferences ? undefined : false}
              href="/app/communications"
              className={styles.iconButton}
              aria-label="Messages"
              title="Messages"
              onClick={close}
            >
              <Inbox size={20} />
            </Link>
            <Link
              prefetch={persistPreferences ? undefined : false}
              href="/app/notes"
              className={styles.iconButton}
              aria-label="Notes"
              title="Notes"
              onClick={close}
            >
              <SquarePen size={20} />
            </Link>
          </div>
        </div>
        <Link
          ref={searchRef}
          prefetch={persistPreferences ? undefined : false}
          href="/app/search"
          className={styles.search}
          aria-label="Rechercher"
          aria-keyshortcuts={
            persistPreferences || onSearch ? (isMac ? "Meta+K" : "Control+K") : undefined
          }
          aria-haspopup={onSearch ? "dialog" : undefined}
          title={
            persistPreferences || onSearch ? `Rechercher (${searchShortcutLabel})` : "Rechercher"
          }
          aria-current={path === "/app/search" ? "page" : undefined}
          onClick={(event) => {
            if (onSearch && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
              event.preventDefault();
              onSearch();
            }
            close();
          }}
        >
          <Search size={18} className={styles.searchIcon} />
          <span>Rechercher dans Relay</span>
          {(persistPreferences || onSearch) && <kbd>{searchShortcutLabel}</kbd>}
        </Link>
        <nav className={styles.quickNav} aria-label="Accès rapide">
          {quickEntries.slice(0, 2).map(({ id: slug, label, href, icon: Icon }) => (
            <Link
              key={slug}
              prefetch={persistPreferences ? undefined : false}
              href={href}
              onClick={close}
              aria-label={label}
              title={label}
              aria-current={path === href ? "page" : undefined}
              className={styles.quickLink}
              data-active={path === href}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          ))}
          {quickEntries.length > 2 && (
            <Dropdown.Root>
              <Dropdown.Trigger
                type="button"
                className={styles.quickMore}
                aria-label="Plus de raccourcis"
                title="Plus de raccourcis"
                data-active={quickEntries.slice(2).some((entry) => path === entry.href)}
              >
                <Ellipsis size={18} />
              </Dropdown.Trigger>
              <Dropdown.Portal>
                <Dropdown.Content
                  className="sb-dropdown"
                  align="end"
                  sideOffset={6}
                  aria-label="Autres raccourcis"
                >
                  {quickEntries.slice(2).map(({ id, label, href, icon: Icon }) => (
                    <Dropdown.Item key={id} asChild>
                      <Link
                        className="sb-dropdown-item"
                        href={href}
                        prefetch={persistPreferences ? undefined : false}
                        onClick={close}
                        aria-current={path === href ? "page" : undefined}
                      >
                        <Icon size={16} />
                        {label}
                      </Link>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
          )}
        </nav>
      </SidebarHeader>
      <SidebarContent>
        {customizing ? (
          <SidebarCustomizer
            sections={groups.map((group) => ({
              id: group.id,
              label: group.label,
              icon: group.icon,
              entries: entries
                .filter(
                  (entry) =>
                    group.items.some(([slug]) => slug === entry.id) ||
                    (group.id === "crm" && entry.id.startsWith("object-")),
                )
                .flatMap((entry) => [entry, ...(entry.children ?? [])]),
            }))}
            shortcuts={shortcutCatalog}
            preferences={preferences}
            onChange={savePreferences}
          />
        ) : (
          <nav aria-label="Navigation principale">
            {preferences.favorites.length > 0 && (
              <SidebarGroup className={styles.group}>
                <button
                  type="button"
                  className={"sb-menu-button " + styles.trigger}
                  aria-expanded={expanded.favorites ?? true}
                  aria-controls="relay-nav-favorites"
                  onClick={() => setGroupOpen("favorites", !(expanded.favorites ?? true))}
                >
                  <span>Favoris</span>
                  <ChevronRight
                    className={styles.chevron}
                    data-open={expanded.favorites ?? true}
                    size={12}
                  />
                </button>
                <ul
                  className={styles.entryList}
                  id="relay-nav-favorites"
                  hidden={!(expanded.favorites ?? true)}
                >
                  {preferences.favorites
                    .map((id) => allEntries.find((entry) => entry.id === id))
                    .filter((entry): entry is SidebarEntry => !!entry)
                    .map(renderEntry)}
                </ul>
              </SidebarGroup>
            )}
            {preferences.order
              .map((id) => groups.find((group) => group.id === id))
              .filter((group) => !!group)
              .map((group) => {
                const active = currentGroup(path) === group.id;
                const open = expanded[group.id] ?? active;
                const hidden = preferences.hidden.includes(group.id);
                if (hidden) return null;
                const panelId = "relay-nav-" + group.id;
                const groupEntries = entries
                  .filter(
                    (entry) =>
                      group.items.some(([slug]) => slug === entry.id) ||
                      (group.id === "crm" && entry.id.startsWith("object-")),
                  )
                  .sort(
                    (a, b) =>
                      preferences.entryOrder.indexOf(a.id) - preferences.entryOrder.indexOf(b.id),
                  );
                return (
                  <SidebarGroup key={group.id} className={styles.group} data-hidden={hidden}>
                    <div className={styles.sectionHead}>
                      <button
                        type="button"
                        className={"sb-menu-button " + styles.trigger}
                        aria-label={group.label}
                        aria-expanded={open}
                        aria-controls={panelId}
                        onClick={() => setGroupOpen(group.id, !open)}
                      >
                        <span>{group.label}</span>
                        <ChevronRight
                          aria-hidden="true"
                          className={styles.chevron}
                          data-open={open}
                          size={12}
                        />
                      </button>
                      <div className={styles.sectionActions}>
                        <Link
                          prefetch={persistPreferences ? undefined : false}
                          href={groupEntries[0]?.href ?? "/app/dashboard"}
                          onClick={close}
                          aria-label={"Ouvrir " + group.label}
                          title={"Ouvrir " + group.label}
                          className={styles.smallAction}
                        >
                          <ArrowUpRight size={14} />
                        </Link>
                        <Dropdown.Root>
                          <Dropdown.Trigger
                            className={styles.smallAction}
                            aria-label={"Ajouter un raccourci : " + group.label}
                            title="Ajouter un raccourci"
                          >
                            <Plus size={14} />
                          </Dropdown.Trigger>
                          <Dropdown.Portal>
                            <Dropdown.Content
                              className={"sb-dropdown " + styles.actionMenu}
                              side="right"
                              align="start"
                              sideOffset={6}
                              collisionPadding={8}
                            >
                              <Dropdown.Label className="sb-dropdown-label">
                                Ajouter aux favoris
                              </Dropdown.Label>
                              {groupEntries.map((entry) => (
                                <Dropdown.CheckboxItem
                                  key={entry.id}
                                  className="sb-dropdown-item"
                                  checked={preferences.favorites.includes(entry.id)}
                                  onCheckedChange={() => toggleFavorite(entry.id)}
                                >
                                  <entry.icon size={16} />
                                  <span>{entry.label}</span>
                                  <Dropdown.ItemIndicator>
                                    <Check size={14} />
                                  </Dropdown.ItemIndicator>
                                </Dropdown.CheckboxItem>
                              ))}
                            </Dropdown.Content>
                          </Dropdown.Portal>
                        </Dropdown.Root>
                        <Dropdown.Root>
                          <Dropdown.Trigger
                            className={styles.smallAction}
                            aria-label={"Menu de la section : " + group.label}
                            title="Ouvrir le menu"
                          >
                            <Ellipsis size={14} />
                          </Dropdown.Trigger>
                          <Dropdown.Portal>
                            <Dropdown.Content
                              className={"sb-dropdown " + styles.actionMenu}
                              side="right"
                              align="start"
                              sideOffset={6}
                              collisionPadding={8}
                            >
                              <Dropdown.Label className="sb-dropdown-label">
                                {group.label}
                              </Dropdown.Label>
                              <Dropdown.Item
                                className="sb-dropdown-item"
                                onSelect={() => setGroupOpen(group.id, !open)}
                              >
                                <ChevronRight size={16} />
                                {open ? "Replier la section" : "Déplier la section"}
                              </Dropdown.Item>
                              <Dropdown.Separator className="sb-separator" />
                              <Dropdown.Item
                                className="sb-dropdown-item"
                                disabled={preferences.order.indexOf(group.id) === 0}
                                onSelect={() => moveGroup(group.id, -1)}
                              >
                                <ArrowUp size={16} />
                                Remonter
                              </Dropdown.Item>
                              <Dropdown.Item
                                className="sb-dropdown-item"
                                disabled={
                                  preferences.order.indexOf(group.id) ===
                                  preferences.order.length - 1
                                }
                                onSelect={() => moveGroup(group.id, 1)}
                              >
                                <ArrowDown size={16} />
                                Descendre
                              </Dropdown.Item>
                              <Dropdown.Separator className="sb-separator" />
                              <Dropdown.Item
                                className="sb-dropdown-item"
                                onSelect={() => setAllGroups(true)}
                              >
                                <ChevronsUpDown size={16} />
                                Tout déplier
                              </Dropdown.Item>
                              <Dropdown.Item
                                className="sb-dropdown-item"
                                onSelect={() => setAllGroups(false)}
                              >
                                <ChevronsUpDown size={16} />
                                Tout replier
                              </Dropdown.Item>
                              <Dropdown.Item
                                className="sb-dropdown-item"
                                onSelect={() => setCustomizing(true)}
                              >
                                <SlidersHorizontal size={16} />
                                Personnaliser la barre latérale
                              </Dropdown.Item>
                            </Dropdown.Content>
                          </Dropdown.Portal>
                        </Dropdown.Root>
                      </div>
                    </div>
                    <SidebarGroupContent id={panelId} hidden={!open} className={styles.content}>
                      <ul className={styles.entryList}>
                        {groupEntries
                          .filter((entry) => !preferences.hiddenEntries.includes(entry.id))
                          .map(renderEntry)}
                      </ul>
                    </SidebarGroupContent>
                  </SidebarGroup>
                );
              })}
          </nav>
        )}
      </SidebarContent>
      <SidebarFooter>
        <button
          type="button"
          className={customizing ? styles.doneButton : styles.settingsLink}
          aria-expanded={customizing}
          onClick={() => setCustomizing(!customizing)}
        >
          {customizing ? <Check size={16} /> : <SlidersHorizontal size={18} />}
          <span>{customizing ? "Terminé" : "Personnaliser la barre latérale"}</span>
        </button>
        {!customizing && (
          <Link
            prefetch={persistPreferences ? undefined : false}
            href="/app/settings"
            className={styles.settingsLink}
            aria-label="Paramètres"
            aria-current={path === "/app/settings" ? "page" : undefined}
            onClick={close}
          >
            <Settings size={18} />
            <span>Paramètres</span>
          </Link>
        )}
        <div className={styles.bottomBar}>
          <Dropdown.Root>
            <Dropdown.Trigger
              className={"sb-workspace-button " + styles.workspaceButton}
              aria-label={"Changer d’espace : " + workspace.name}
            >
              <span className={styles.workspaceAvatar} aria-hidden="true">
                {workspace.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="sb-workspace-copy">
                <strong>{workspace.name}</strong>
              </span>
              <ChevronDown size={14} className="sb-workspace-chevron" />
            </Dropdown.Trigger>
            <Dropdown.Portal>
              <Dropdown.Content
                className="sb-dropdown"
                data-mobile={isMobile ? "true" : undefined}
                side="top"
                align="start"
                sideOffset={8}
                collisionPadding={12}
                sticky="always"
              >
                <Dropdown.Label className="sb-dropdown-label">
                  Vos espaces de travail
                </Dropdown.Label>
                {workspaces.map((w) => (
                  <Dropdown.Item
                    key={w.id}
                    className="sb-dropdown-item"
                    onSelect={() => {
                      switchWorkspace(w.id);
                      close();
                    }}
                  >
                    <span className="sb-workspace-avatar">{w.name.slice(0, 1).toUpperCase()}</span>
                    <span>{w.name}</span>
                    {w.id === workspace.id && <Check size={15} />}
                  </Dropdown.Item>
                ))}
                <Dropdown.Separator className="sb-separator" />
                <Dropdown.Item asChild>
                  <Link
                    prefetch={persistPreferences ? undefined : false}
                    className="sb-dropdown-item"
                    href="/app/settings"
                    onClick={close}
                  >
                    <Settings size={15} />
                    Gérer l’espace
                  </Link>
                </Dropdown.Item>
              </Dropdown.Content>
            </Dropdown.Portal>
          </Dropdown.Root>
          <Link
            prefetch={persistPreferences ? undefined : false}
            href="/app/integrations"
            className={styles.iconButton}
            aria-label="Intégrations"
            title="Intégrations"
            onClick={close}
          >
            <Plug size={18} />
          </Link>
          <Link
            prefetch={persistPreferences ? undefined : false}
            href="/doc"
            className={styles.iconButton}
            aria-label="Aide"
            title="Aide"
            onClick={close}
          >
            <CircleHelp size={18} />
          </Link>
          <Dropdown.Root>
            <Dropdown.Trigger
              className={styles.iconButton}
              aria-label="Ouvrir le menu de mon compte"
              title={user.email ?? "Mon compte"}
            >
              <LayoutGrid size={18} />
            </Dropdown.Trigger>
            <Dropdown.Portal>
              <Dropdown.Content
                className="sb-dropdown"
                data-mobile={isMobile ? "true" : undefined}
                side="top"
                align={isMobile ? "start" : "end"}
                sideOffset={isMobile ? 6 : 9}
                collisionPadding={12}
                sticky="always"
              >
                <Dropdown.Label className="sb-dropdown-label">{user.email}</Dropdown.Label>
                <Dropdown.Item asChild>
                  <Link
                    prefetch={persistPreferences ? undefined : false}
                    className="sb-dropdown-item"
                    href="/app/settings"
                    onClick={close}
                  >
                    <Settings size={15} />
                    Paramètres de mon espace
                  </Link>
                </Dropdown.Item>
                <Dropdown.Item asChild>
                  <Link
                    prefetch={persistPreferences ? undefined : false}
                    className="sb-dropdown-item"
                    href="/portal"
                    onClick={close}
                  >
                    <Globe size={15} />
                    Mes portails clients
                  </Link>
                </Dropdown.Item>
                <Dropdown.Separator className="sb-separator" />
                <Dropdown.Item className="sb-dropdown-item sb-signout" onSelect={onSignOut}>
                  <LogOut size={15} />
                  Se déconnecter
                </Dropdown.Item>
              </Dropdown.Content>
            </Dropdown.Portal>
          </Dropdown.Root>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
