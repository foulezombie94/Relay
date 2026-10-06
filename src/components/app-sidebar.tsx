"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  ChevronsUpDown,
  LogOut,
  Box,
  ArrowUpRight,
  Check,
  Plus,
  BookOpen,
  ChevronDown,
} from "lucide-react";
import { useWorkspace } from "./data-provider";
import { browserDb } from "@/lib/supabase/client";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarRail,
  useSidebar,
} from "./ui/sidebar";
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
      ["sequences", "Séquences", ArrowUpRight],
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    icon: Sparkles,
    items: [
      ["assistant", "Assistant IA", Sparkles],
      ["quality", "Qualité des données", TriangleAlert],
      ["playbooks", "Guides d’action", FolderKanban],
    ],
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
    items: [["workflows", "Automatisations", Workflow]],
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
  return groups.find((group) =>
    group.items.some(([slug]) => itemActive(slug, path)),
  )?.id;
}
export function AppSidebar() {
  const { workspace, workspaces, switchWorkspace, objects, user } =
    useWorkspace();
  const path = usePathname();
  const { setOpenMobile, setOpen, state, isMobile } = useSidebar();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const preferenceKey = "relay_nav_groups:" + user.id;
  const compact = state === "collapsed" && !isMobile;
  useEffect(() => {
    let saved: Record<string, boolean> = {};
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(preferenceKey) ?? "{}",
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
    setExpanded({ ...saved, ...(active ? { [active]: true } : {}) });
  }, [path, preferenceKey]);
  function toggleGroup(id: string) {
    const next = {
      ...expanded,
      [id]: compact ? true : !(expanded[id] ?? currentGroup(path) === id),
    };
    setExpanded(next);
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(next));
    } catch {
      /* Navigation remains usable without storage. */
    }
    if (compact) setOpen(true);
  }
  useEffect(() => {
    setOpenMobile(false);
  }, [path, setOpenMobile]);
  function close() {
    setOpenMobile(false);
  }
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/app/companies"
          className="sb-brand"
          onClick={close}
          aria-label="Relay CRM"
        >
          <span className="brand-mark">r</span>
          <span className="sb-brand-text">
            relay <small>CRM</small>
          </span>
        </Link>
        <Dropdown.Root>
          <Dropdown.Trigger
            className="sb-workspace-button"
            aria-label={"Changer d’espace : " + workspace.name}
          >
            <span className="sb-workspace-avatar">
              {workspace.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="sb-workspace-copy">
              <strong>{workspace.name}</strong>
              <small>Espace de travail</small>
            </span>
            <ChevronsUpDown size={15} className="sb-workspace-chevron" />
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content
              className="sb-dropdown"
              side="right"
              align="start"
              sideOffset={9}
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
                  <span className="sb-workspace-avatar">
                    {w.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>{w.name}</span>
                  {w.id === workspace.id && <Check size={15} />}
                </Dropdown.Item>
              ))}
              <Dropdown.Separator className="sb-separator" />
              <Dropdown.Item asChild>
                <Link
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
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/app/search">{null}</Link>}
              tooltip="Rechercher"
              isActive={path === "/app/search"}
              onClick={close}
              className="sb-search-button"
            >
              <Search size={17} />
              <span>Rechercher</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Navigation principale">
          <SidebarGroup>
            <SidebarGroupLabel>Accueil</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link href="/app/priorities">{null}</Link>}
                  tooltip="À traiter"
                  isActive={path === "/app/priorities"}
                  onClick={close}
                >
                  <CheckSquare size={18} />
                  <span>À traiter</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
          {groups.map((group) => {
            const Icon = group.icon;
            const active = currentGroup(path) === group.id;
            const open = !compact && (expanded[group.id] ?? active);
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
                      <Icon size={18} />
                      <span>{group.label}</span>
                      <ChevronDown
                        aria-hidden="true"
                        className={styles.chevron}
                        data-open={open}
                      />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
                <SidebarGroupContent
                  id={panelId}
                  hidden={!open}
                  className={styles.content}
                >
                  <SidebarMenu>
                    {group.items.map(([slug, label, ItemIcon]) => (
                      <SidebarMenuItem key={slug}>
                        <SidebarMenuButton
                          render={<Link href={"/app/" + slug}>{null}</Link>}
                          isActive={itemActive(slug, path)}
                          tooltip={label}
                          onClick={close}
                        >
                          <ItemIcon size={18} />
                          <span>{label}</span>
                        </SidebarMenuButton>
                        {slug === "assistant" && (
                          <SidebarMenuBadge>IA</SidebarMenuBadge>
                        )}
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
                                  <Link href={"/app/object-" + o.slug}>
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
        <SidebarMenu>
          {(
            [
              ["/app/integrations", "Intégrations", Plug],
              ["/app/settings", "Paramètres", Settings],
              ["/doc", "Aide", BookOpen],
            ] as const
          ).map(([href, label, Icon]) => {
            const ItemIcon = Icon;
            return (
              <SidebarMenuItem key={String(href)}>
                <SidebarMenuButton
                  render={<Link href={String(href)}>{null}</Link>}
                  isActive={path === href}
                  tooltip={String(label)}
                  onClick={close}
                >
                  <ItemIcon size={18} />
                  <span>{String(label)}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
        <Dropdown.Root>
          <Dropdown.Trigger
            className="sb-user-button"
            aria-label="Ouvrir le menu de mon compte"
          >
            <span className="sb-user-avatar">
              {(user.email ?? "U").slice(0, 1).toUpperCase()}
            </span>
            <span className="sb-user-copy">
              <strong>{user.email?.split("@")[0] ?? "Mon compte"}</strong>
              <small>
                {workspace.role === "owner"
                  ? "Propriétaire"
                  : workspace.role === "admin"
                    ? "Administrateur"
                    : workspace.role === "viewer"
                      ? "Lecture seule"
                      : "Membre"}
              </small>
            </span>
            <ChevronsUpDown size={15} className="sb-workspace-chevron" />
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content
              className="sb-dropdown"
              side="right"
              align="end"
              sideOffset={9}
            >
              <Dropdown.Label className="sb-dropdown-label">
                {user.email}
              </Dropdown.Label>
              <Dropdown.Item asChild>
                <Link
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
                  className="sb-dropdown-item"
                  href="/portal"
                  onClick={close}
                >
                  <Globe size={15} />
                  Mes portails clients
                </Link>
              </Dropdown.Item>
              <Dropdown.Separator className="sb-separator" />
              <Dropdown.Item
                className="sb-dropdown-item sb-signout"
                onSelect={async () => {
                  const { error } = await browserDb().auth.signOut();
                  if (!error) window.location.assign("/login");
                }}
              >
                <LogOut size={15} />
                Se déconnecter
              </Dropdown.Item>
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
