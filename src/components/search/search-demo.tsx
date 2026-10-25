"use client";
import { useState } from "react";
import Link from "next/link";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "../ui/sidebar";
import { AppSidebarView } from "../layout/app-sidebar-view";
import { SearchDialogView } from "./search-dialog-view";
import { searchNavigation, type SearchEntry } from "./search-model";
import type { Workspace } from "@/lib/domain/types";
import styles from "./search-demo.module.css";
const workspace: Workspace = {
  id: "demo",
  workspace_id: "demo",
  created_at: "2026-10-01T12:00:00Z",
  name: "Équipe Rivage",
  role: "viewer",
  currency: "EUR",
  timezone: "Europe/Paris",
  locale: "fr-FR",
};
const examples: SearchEntry[] = [
  {
    id: "r1",
    title: "Studio Rivage",
    category: "Fiches",
    href: "/demo/dense-views",
    excerpt: "Compte client fictif. Proposition commerciale en cours de préparation.",
  },
  {
    id: "r2",
    title: "Maison Atlas",
    category: "Fiches",
    href: "/demo/dense-views",
    excerpt: "Opportunité fictive. Prochain rendez-vous à préparer avec l’équipe.",
  },
  {
    id: "n1",
    title: "Note de réunion · Studio Rivage",
    category: "Notes",
    href: "/demo/assistant",
    excerpt:
      "Exemple de note privée de démonstration : préparer la proposition et confirmer les prochaines étapes.",
    private: true,
  },
];
export function SearchDemo() {
  const [open, setOpen] = useState(false),
    [term, setTerm] = useState(""),
    [scope, setScope] = useState("all");
  function close() {
    setOpen(false);
    setTerm("");
    setScope("all");
  }
  const labels: Record<string, string> = {
    records: "Fiches",
    notes: "Notes",
    tasks: "Tâches",
    commitments: "Engagements",
    meetings: "Réunions",
  };
  const entries =
    term.trim().length < 2
      ? searchNavigation.map((item) => ({ ...item, href: "/demo/components" }))
      : examples.filter(
          (item) =>
            (scope === "all" || item.category === labels[scope]) &&
            (item.title + " " + item.excerpt)
              .toLocaleLowerCase("fr")
              .includes(term.trim().toLocaleLowerCase("fr")),
        );
  return (
    <SidebarProvider interactive={false} data-relay-ui>
      <AppSidebarView
        workspace={workspace}
        workspaces={[workspace]}
        switchWorkspace={() => {}}
        objects={[]}
        user={{ id: "demo", email: "marie@rivage.example" }}
        path="/app/dashboard"
        onSignOut={() => {}}
        onSearch={() => setOpen(true)}
        persistPreferences={false}
      />
      <SidebarInset>
        <header className={styles.header}>
          <SidebarTrigger />
          <span>Recherche et navigation</span>
          <Link href="/app/dashboard" prefetch={false}>
            Ouvrir mon espace
          </Link>
        </header>
        <main className={styles.body}>
          <h1>Votre espace reste sous les yeux</h1>
          <p>Cliquez sur la recherche de la sidebar ou utilisez Ctrl+K / ⌘K.</p>
          <button type="button" className="button" onClick={() => setOpen(true)}>
            Ouvrir la recherche
          </button>
          <p className="caption">
            Démonstration · Données fictives · Essayez « Rivage » ou « Atlas ».
          </p>
        </main>
      </SidebarInset>
      {open && (
        <SearchDialogView
          open
          onClose={close}
          workspaceName={workspace.name}
          term={term}
          onTerm={setTerm}
          scope={scope}
          onScope={setScope}
          entries={entries}
          prefetch={false}
        />
      )}
    </SidebarProvider>
  );
}
