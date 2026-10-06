"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
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
    label: "Espace de travail",
    items: [
      ["priorities", "À traiter", CheckSquare],
      ["companies", "Entreprises", Building2],
      ["people", "Personnes", Users],
      ["deals", "Opportunités", Layers],
      ["lists", "Listes", List],
      ["tasks", "Tâches", CheckSquare],
    ],
  },
  {
    label: "Contexte & intelligence",
    items: [
      ["communications", "Messages", MessageSquare],
      ["assistant", "Assistant IA", Sparkles],
      ["meetings", "Réunions", Video],
      ["notes", "Notes", MessageSquare],
      ["playbooks", "Guides d’action", FolderKanban],
      ["quality", "Qualité des données", TriangleAlert],
      ["workflows", "Automatisations", Workflow],
      ["sequences", "Séquences", ArrowUpRight],
      ["reports", "Rapports", BarChart3],
    ],
  },
  {
    label: "De la promesse à l’action",
    items: [
      ["commitments", "Engagements", Handshake],
      ["conflicts", "Contradictions", TriangleAlert],
      ["handovers", "Réalisation", FolderKanban],
      ["portals", "Portails clients", Globe],
    ],
  },
] as const;
export function AppSidebar() {
  const { workspace, workspaces, switchWorkspace, objects, user } =
    useWorkspace();
  const path = usePathname();
  const { setOpenMobile } = useSidebar();
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
          {groups.map((g) => (
            <SidebarGroup key={g.label}>
              <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {g.items.map(([slug, label, Icon]) => (
                    <SidebarMenuItem key={slug}>
                      <SidebarMenuButton
                        render={<Link href={"/app/" + slug}>{null}</Link>}
                        isActive={
                          path === "/app/" + slug ||
                          (slug === "lists" && path.startsWith("/app/list-"))
                        }
                        tooltip={label}
                        onClick={close}
                      >
                        <Icon size={18} />
                        <span>{label}</span>
                      </SidebarMenuButton>
                      {slug === "assistant" && (
                        <SidebarMenuBadge>IA</SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
          {objects.some((o) => !o.standard) && (
            <SidebarGroup>
              <SidebarGroupLabel>Vos objets</SidebarGroupLabel>
              <SidebarMenu>
                {objects
                  .filter((o) => !o.standard)
                  .map((o) => (
                    <SidebarMenuItem key={o.id}>
                      <SidebarMenuButton
                        render={
                          <Link href={"/app/object-" + o.slug}>{null}</Link>
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
              </SidebarMenu>
            </SidebarGroup>
          )}
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {(
            [
              ["integrations", "Intégrations", Plug],
              ["settings", "Paramètres", Settings],
            ] as const
          ).map(([slug, label, Icon]) => (
            <SidebarMenuItem key={slug}>
              <SidebarMenuButton
                render={<Link href={"/app/" + slug}>{null}</Link>}
                isActive={path === "/app/" + slug}
                tooltip={label}
                onClick={close}
              >
                <Icon size={18} />
                <span>{label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
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
