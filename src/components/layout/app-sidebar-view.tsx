"use client";
import Link from "next/link";
import type { Workspace, ObjectDefinition } from "@/lib/domain/types";
import { useEffect, useRef, useState } from "react";
import styles from "./app-sidebar.module.css";
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
} from "lucide-react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
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
  persistPreferences = true,
}: {
  workspace: Workspace;
  workspaces: Workspace[];
  switchWorkspace: (id: string) => void;
  objects: ObjectDefinition[];
  user: { id: string; email?: string };
  path: string;
  onSignOut: () => void | Promise<void>;
  persistPreferences?: boolean;
}) {
  const { setOpenMobile, setOpen, state, isMobile } = useSidebar();
  const searchRef = useRef<HTMLAnchorElement>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const preferenceKey = "relay_nav_groups:" + user.id;
  const compact = state === "collapsed" && !isMobile;
  useEffect(() => {
    if (!persistPreferences) return;
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
  }, [persistPreferences]);
  useEffect(() => {
    if (!persistPreferences) return;
    const saved: Record<string, boolean> = {};
    try {
      const value: unknown = JSON.parse(
        persistPreferences ? (localStorage.getItem(preferenceKey) ?? "{}") : "{}",
      );
      if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const group of groups) {
          const open = (value as Record<string, unknown>)[group.id];
          if (typeof open === "boolean") saved[group.id] = open;
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
  function toggleGroup(id: string) {
    const next = {
      ...expanded,
      [id]: compact ? true : !(expanded[id] ?? currentGroup(path) === id),
    };
    setExpanded(next);
    try {
      if (persistPreferences) localStorage.setItem(preferenceKey, JSON.stringify(next));
    } catch {
      /* Navigation remains usable without storage. */
    }
    if (compact) setOpen(true);
  }
  useEffect(() => {
    // Keep the mobile navigation closed when the route changes.
    setOpenMobile(false);
  }, [path, setOpenMobile]);
  function close() {
    setOpenMobile(false);
  }
  return (
    <Sidebar collapsible="icon" className={styles.sidebar}>
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
          aria-current={path === "/app/search" ? "page" : undefined}
          onClick={close}
        >
          <Search size={18} className={styles.searchIcon} />
          <span>Rechercher dans Relay</span>
          {persistPreferences && <kbd>Ctrl+K</kbd>}
        </Link>
        <nav className={styles.quickNav} aria-label="Accès rapide">
          {(
            [
              ["dashboard", "Dashboard", Home],
              ["assistant", "Ask Zyliad", Sparkles],
              ["priorities", "À traiter", CheckSquare],
            ] as const
          ).map(([slug, label, Icon]) => (
            <Link
              key={slug}
              prefetch={persistPreferences ? undefined : false}
              href={"/app/" + slug}
              onClick={close}
              aria-label={label}
              title={label}
              aria-current={path === "/app/" + slug ? "page" : undefined}
              className={styles.quickLink}
              data-active={path === "/app/" + slug}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Navigation principale">
          {groups.map((group) => {
            const Icon = group.icon;
            const active = currentGroup(path) === group.id;
            const open = !compact && (expanded[group.id] ?? active);
            const GroupIndicator = open ? ChevronDown : ChevronRight;
            const panelId = "relay-nav-" + group.id;
            return (
              <SidebarGroup key={group.id} className={styles.group}>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip={group.label}
                      className={styles.trigger}
                      data-current={active}
                      aria-expanded={open}
                      aria-controls={panelId}
                      onClick={() => toggleGroup(group.id)}
                    >
                      <Icon size={18} className={styles.compactIcon} />
                      <span>{group.label}</span>
                      <GroupIndicator
                        aria-hidden="true"
                        className={styles.chevron}
                        data-open={open}
                      />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
                <SidebarGroupContent id={panelId} hidden={!open} className={styles.content}>
                  <SidebarMenu>
                    {group.items.map(([slug, label, ItemIcon]) => (
                      <SidebarMenuItem key={slug}>
                        <SidebarMenuButton
                          render={
                            <Link
                              prefetch={persistPreferences ? undefined : false}
                              href={"/app/" + slug}
                            >
                              {null}
                            </Link>
                          }
                          isActive={itemActive(slug, path)}
                          tooltip={label}
                          onClick={close}
                        >
                          <ItemIcon size={20} />
                          <span>{label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                    {group.id === "crm" && objects.some((o) => !o.standard) && (
                      <>
                        <li className={styles.objectLabel}>Vos objets</li>
                        {objects
                          .filter((o) => !o.standard)
                          .map((o) => (
                            <SidebarMenuItem key={o.id}>
                              <SidebarMenuButton
                                render={
                                  <Link
                                    prefetch={persistPreferences ? undefined : false}
                                    href={"/app/object-" + o.slug}
                                  >
                                    {null}
                                  </Link>
                                }
                                isActive={path === "/app/object-" + o.slug}
                                tooltip={o.name}
                                onClick={close}
                              >
                                <Box size={18} />
                                <span>{o.name}</span>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          ))}
                      </>
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
        </nav>
      </SidebarContent>
      <SidebarFooter>
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
