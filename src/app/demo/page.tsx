"use client";
import { useState } from "react";
import Link from "next/link";
import { Building2, Users, Layers3, Plus, Table2, Columns3 } from "lucide-react";
import { AppSidebarView } from "@/components/layout/app-sidebar-view";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { RecordTable } from "@/components/records/table";
import { RecordBoard } from "@/components/records/board";
import { RecordSummary } from "@/components/records/summary";
import { RecordOverview } from "@/components/records/overview";
import { Drawer, Empty, SearchBox } from "@/components/ui";
import type { CrmRecord, ObjectDefinition, Workspace } from "@/lib/domain/types";
import details from "@/components/records/record-details.module.css";
import styles from "./demo.module.css";
const created_at = "2026-10-01T12:00:00Z";
const workspace: Workspace = {
  id: "demo",
  workspace_id: "demo",
  created_at,
  name: "Équipe Rivage",
  role: "viewer",
  currency: "EUR",
  timezone: "Europe/Paris",
  locale: "fr-FR",
};
const objects: ObjectDefinition[] = [
  {
    id: "companies",
    workspace_id: "demo",
    created_at,
    slug: "companies",
    name: "Entreprises",
    icon: "Building2",
    standard: true,
  },
  {
    id: "people",
    workspace_id: "demo",
    created_at,
    slug: "people",
    name: "Personnes",
    icon: "Users",
    standard: true,
  },
  {
    id: "deals",
    workspace_id: "demo",
    created_at,
    slug: "deals",
    name: "Opportunités",
    icon: "Layers3",
    standard: true,
  },
];
const companies = [
  "Studio Rivage",
  "Maison Atlas",
  "Équipe Nova",
  "Atelier Horizon",
  "Collectif Lumen",
  "Bureau Opale",
  "Maison Sillage",
  "Studio Aube",
];
const fixtures: CrmRecord[] = companies.flatMap((name, index) => {
  const domain =
    ["rivage", "atlas", "nova", "horizon", "lumen", "opale", "sillage", "aube"][index] + ".example";
  const base = {
    workspace_id: "demo",
    created_at,
    email: "contact@" + domain,
    domain,
    stage: ["Qualification", "Proposition", "Gagné", "Nouveau"][index % 4],
    amount: [12000, 8500, 21000, 6400][index % 4],
    currency: "EUR",
    owner_id: "demo-user",
    attributes: {},
    archived: false,
    version: 1,
    close_date: "2026-10-20",
  };
  return [
    { ...base, id: "company-" + index, object_id: "companies", display_name: name },
    {
      ...base,
      id: "person-" + index,
      object_id: "people",
      display_name: [
        "Marie Laurent",
        "Thomas Bernard",
        "Alice Martin",
        "Emma Dubois",
        "Lucas Moreau",
        "Léa Petit",
        "Hugo Roux",
        "Camille Girard",
      ][index],
    },
    { ...base, id: "deal-" + index, object_id: "deals", display_name: name + " · Accompagnement" },
  ];
});
export default function DemoPage() {
  const [slug, setSlug] = useState("companies");
  const [mode, setMode] = useState("table");
  const [search, setSearch] = useState("");
  const [record, setRecord] = useState<CrmRecord | null>(null);
  const [tab, setTab] = useState("overview");
  const title = objects.find((object) => object.id === slug)?.name ?? "Entreprises";
  const Icon = slug === "people" ? Users : slug === "deals" ? Layers3 : Building2;
  const rows = fixtures.filter(
    (row) =>
      row.object_id === slug &&
      (row.display_name + row.email + row.domain)
        .toLocaleLowerCase("fr")
        .includes(search.toLocaleLowerCase("fr")),
  );
  function navigate(next: string) {
    setSlug(next);
    setMode(next === "deals" ? "kanban" : "table");
    setSearch("");
  }
  return (
    <div
      data-relay-ui
      className={styles.root}
      onClickCapture={(event) => {
        const anchor = (event.target as HTMLElement).closest("a");
        const next = anchor?.getAttribute("href")?.replace("/app/", "");
        if (next && objects.some((object) => object.slug === next)) {
          event.preventDefault();
          navigate(next);
        }
      }}
    >
      <SidebarProvider interactive={false}>
        <AppSidebarView
          workspace={workspace}
          workspaces={[workspace]}
          objects={objects}
          user={{ id: "demo-user", email: "marie@rivage.example" }}
          path={"/app/" + slug}
          switchWorkspace={() => {}}
          onSignOut={() => {
            window.location.href = "/login";
          }}
          persistPreferences={false}
        />
        <SidebarInset>
          <header className="sb-topbar">
            <SidebarTrigger />
            <span className="sb-topbar-divider" />
            <span className="sb-breadcrumb-workspace">Équipe Rivage</span>
            <span className="sb-breadcrumb-slash">/</span>
            <span className="sb-breadcrumb-current">{title}</span>
            <Link className={styles.login} href="/demo/components">
              Composants
            </Link>
            <Link className={styles.login} href="/login">
              Ouvrir mon espace
            </Link>
          </header>
          <div className={styles.notice}>
            Démonstration en lecture seule · toutes les données sont fictives
          </div>
          <main className={styles.main}>
            <header className={styles.heading}>
              <h1>
                <span className="sb-object-icon">
                  <Icon size={15} />
                </span>
                {title}
              </h1>
              <button className="button primary" disabled>
                <Plus size={15} /> Ajouter
              </button>
            </header>
            <nav className={styles.views} aria-label="Objets de démonstration">
              {objects.map((object) => (
                <button
                  key={object.id}
                  className={slug === object.id ? styles.active : ""}
                  aria-pressed={slug === object.id}
                  onClick={() => navigate(object.id)}
                >
                  {object.name}
                </button>
              ))}
            </nav>
            <div className={styles.toolbar}>
              <SearchBox value={search} onChange={setSearch} />
              <span className="pill">{rows.length} fiches</span>
              {slug === "deals" && (
                <div className="segmented">
                  <button
                    className={mode === "table" ? "active" : ""}
                    aria-pressed={mode === "table"}
                    onClick={() => setMode("table")}
                  >
                    <Table2 size={14} /> Tableau
                  </button>
                  <button
                    className={mode === "kanban" ? "active" : ""}
                    aria-pressed={mode === "kanban"}
                    onClick={() => setMode("kanban")}
                  >
                    <Columns3 size={14} /> Pipeline
                  </button>
                </div>
              )}
            </div>
            {rows.length ? (
              mode === "kanban" ? (
                <div className={styles.board}>
                  <RecordBoard
                    rows={rows}
                    members={[
                      {
                        id: "demo-member",
                        workspace_id: "demo",
                        created_at,
                        user_id: "demo-user",
                        display_name: "Marie Laurent",
                      },
                    ]}
                    readonly
                    busy={false}
                    onCreate={() => {}}
                    onMove={async () => {}}
                    onOpen={(row) => {
                      setRecord(row);
                      setTab("overview");
                    }}
                  />
                </div>
              ) : (
                <RecordTable
                  rows={rows}
                  columns={
                    slug === "deals"
                      ? ["display_name", "amount", "stage", "close_date"]
                      : ["display_name", "domain", "email"]
                  }
                  slug={slug}
                  onOpen={(row) => {
                    setRecord(row);
                    setTab("overview");
                  }}
                />
              )
            ) : (
              <Empty
                title="Aucune fiche correspondante"
                description="Essayez un autre nom, domaine ou email."
              />
            )}
            <footer className={styles.footer}>
              {rows.length} fiches · Sélectionnez une ligne pour ouvrir son contexte
            </footer>
          </main>
        </SidebarInset>
      </SidebarProvider>
      {record && (
        <Drawer
          open
          onClose={() => setRecord(null)}
          title={title + " / " + record.display_name}
          className={details.drawer}
        >
          <div
            className={details.recordShell}
            onClickCapture={(event) => {
              if ((event.target as HTMLElement).closest('a[href^="/app/"]')) {
                event.preventDefault();
                setTab("relations");
              }
            }}
          >
            <RecordSummary record={record} slug={slug} pipelines={[]} />
            <nav className={details.tabs} aria-label="Sections de la fiche">
              {[
                ["overview", "Aperçu"],
                ["relations", "Relations"],
                ["notes", "Notes"],
                ["tasks", "Tâches"],
                ["documents", "Documents"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  aria-current={tab === key ? "page" : undefined}
                  className={tab === key ? details.activeTab : ""}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className={details.content}>
              {tab === "overview" ? (
                <RecordOverview
                  record={record}
                  slug={slug}
                  context={{
                    record,
                    related: fixtures.filter(
                      (row) =>
                        row.id !== record.id && row.id.endsWith(record.id.split("-").at(-1)!),
                    ),
                    relations: [],
                    timeline: [
                      {
                        id: "demo-task",
                        workspace_id: "demo",
                        created_at,
                        resource: "tasks",
                        title: "Préparer le prochain rendez-vous",
                        due_date: "2026-10-20",
                        status: "todo",
                      },
                      {
                        id: "demo-activity",
                        workspace_id: "demo",
                        created_at,
                        resource: "activities",
                        title: "Premier échange",
                        content: "Les besoins et les prochaines étapes ont été définis ensemble.",
                      },
                    ],
                    counts: {},
                    truncated: false,
                    relation_count: 2,
                  }}
                  objects={objects}
                  attributes={[]}
                  owner="Marie Laurent"
                  pipelines={[]}
                  onTab={setTab}
                  onEdit={() => {}}
                  readonly
                />
              ) : (
                <Empty
                  title={
                    tab === "relations"
                      ? "Relations de démonstration"
                      : "Aucun élément dans cette démonstration"
                  }
                  description="Connectez-vous à votre espace pour retrouver et gérer vos données."
                  action={
                    <Link href="/login" className="button">
                      Ouvrir mon espace
                    </Link>
                  }
                />
              )}
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}
