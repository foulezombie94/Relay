"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useWorkspace } from "./data-provider";
import { Notifications } from "./notifications";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "./ui/sidebar";
const names: Record<string, string> = {
  dashboard: "Dashboard",
  priorities: "À traiter",
  playbooks: "Modèles de processus",
  quality: "Qualité des données",
  companies: "Entreprises",
  people: "Personnes",
  deals: "Opportunités",
  lists: "Listes",
  tasks: "Tâches",
  communications: "Messages",
  assistant: "Ask Relay",
  meetings: "Réunions",
  notes: "Notes",
  workflows: "Automatisations",
  sequences: "Séquences",
  reports: "Rapports",
  commitments: "Engagements",
  conflicts: "Contradictions",
  handovers: "Réalisation",
  portals: "Portails clients",
  settings: "Paramètres",
  pipelines: "Pipelines",
  "email-templates": "Modèles email",
  integrations: "Intégrations",
  search: "Recherche",
};
export function Shell({
  children,
  defaultOpen = true,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const { workspace, objects } = useWorkspace();
  const section = usePathname().split("/")[2] ?? "";
  const name =
    names[section] ??
    (section.startsWith("object-")
      ? objects.find((o) => o.slug === section.slice(7))?.name
      : "Liste") ??
    "Votre espace";
  if (section === "settings") return <main className="settings-page-content">{children}</main>;
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <SidebarInset>
        {section !== "assistant" && (
          <header className="sb-topbar">
            <SidebarTrigger />
            <span className="sb-topbar-divider" />
            <span className="sb-breadcrumb-workspace">{workspace.name}</span>
            <span className="sb-breadcrumb-slash">/</span>
            <span className="sb-breadcrumb-current">{name}</span>
            <Notifications />
            <div className="sb-topbar-privacy">
              <span />
              Espace privé<small>Europe</small>
            </div>
          </header>
        )}
        <main
          className={"page-content" + (section === "assistant" ? " assistant-page-content" : "")}
        >
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
