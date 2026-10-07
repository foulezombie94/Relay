"use client";

import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  LayoutDashboard,
  Users,
  CheckCheck,
  Plus,
  Search,
  PanelLeft,
} from "lucide-react";
import { AppSidebarView } from "@/components/app-sidebar-view";
import { SidebarProvider } from "@/components/ui/sidebar";
import { RecordBoard } from "@/components/record-board";
import { RecordTable } from "@/components/record-table";
import { RecordDirectory } from "@/components/record-directory";
import { ResourceCard } from "@/components/resource-card";
import { ForecastTotals } from "@/components/forecast-totals";
import { PageHeader } from "@/components/ui/display";
import type { CrmRecord, Row, Workspace } from "@/lib/domain/types";
import recordStyles from "@/components/pages/records.module.css";
import styles from "./landing.module.css";

const createdAt = "2026-10-01T12:00:00Z";
const workspace: Workspace = {
  id: "public-preview",
  workspace_id: "public-preview",
  created_at: createdAt,
  name: "Équipe Rivage",
  timezone: "Europe/Paris",
  currency: "EUR",
  locale: "fr-FR",
  role: "viewer",
};
const members: Row[] = [
  {
    id: "preview-member",
    workspace_id: workspace.id,
    created_at: createdAt,
    user_id: "preview-user",
    display_name: "Marie Laurent",
  },
];
function record(
  id: string,
  name: string,
  extra: Partial<CrmRecord> = {},
): CrmRecord {
  return {
    id,
    workspace_id: workspace.id,
    created_at: createdAt,
    object_id: "preview-object",
    display_name: name,
    email: null,
    domain: null,
    stage: "Nouveau",
    amount: 0,
    currency: "EUR",
    owner_id: "preview-user",
    attributes: {},
    archived: false,
    version: 1,
    close_date: null,
    ...extra,
  };
}
const deals: CrmRecord[] = [
  record("deal-1", "Maison Atlas · Accompagnement", {
    stage: "Qualification",
    amount: 8500,
    close_date: "2026-10-20",
  }),
  record("deal-2", "Studio Rivage · Identité & lancement", {
    stage: "Proposition",
    amount: 12000,
    close_date: "2026-10-27",
  }),
  record("deal-3", "Atelier Sillage · Déploiement", {
    stage: "Négociation",
    amount: 19500,
    close_date: "2026-11-05",
  }),
];
const people: CrmRecord[] = [
  record("person-1", "Camille Dubois", { email: "camille@rivage.example" }),
  record("person-2", "Thomas Bernard", { email: "thomas@atlas.example" }),
  record("person-3", "Léa Martin", { email: "lea@sillage.example" }),
];
const companies: CrmRecord[] = [
  record("company-1", "Studio Rivage", { domain: "rivage.example" }),
  record("company-2", "Maison Atlas", { domain: "atlas.example" }),
];
const commitments: Row[] = [
  {
    id: "commitment-1",
    workspace_id: workspace.id,
    created_at: createdAt,
    title: "Préparer l’atelier de lancement",
    status: "in_progress",
    due_date: "2026-10-15T10:00:00+02:00",
    record_id: "company-1",
    record: companies[0],
    source_quote: "Nous souhaitons un atelier de lancement jeudi.",
    description: "Préparer les objectifs et le programme de l’atelier.",
  },
  {
    id: "commitment-2",
    workspace_id: workspace.id,
    created_at: createdAt,
    title: "Partager le compte rendu",
    status: "done",
    due_date: "2026-10-08T15:00:00+02:00",
    record_id: "company-1",
    record: companies[0],
    evidence: "Compte rendu partagé avec les participants.",
  },
];
const noop = () => {};

function CommitmentCards({ compact = false }: { compact?: boolean }) {
  return (
    <div className="stack">
      {(compact ? commitments.slice(0, 1) : commitments).map((row) => (
        <ResourceCard
          key={row.id}
          row={row}
          resource="commitments"
          expanded
          readOnly
          onToggle={noop}
          onEdit={noop}
          onDelete={noop}
          onPortal={noop}
          onComplete={noop}
        />
      ))}
    </div>
  );
}

export function ProductScene({
  kind,
}: {
  kind: "relations" | "forecast" | "realisation";
}) {
  return (
    <figure className={styles.actualScene}>
      <div className={styles.realUI} inert>
        {kind === "relations" ? (
          <>
            <PageHeader
              title="Entreprises"
              description="Vos comptes clients et prospects, avec leur contexte et leurs coordonnées."
            />
            <RecordDirectory
              rows={companies}
              members={members}
              slug="companies"
              onOpen={noop}
            />
          </>
        ) : kind === "forecast" ? (
          <>
            <PageHeader
              title="Rapports"
              description="Votre activité commerciale, en un coup d’œil."
            />
            <h2>EUR</h2>
            <ForecastTotals
              forecast={{ open: 40000, weighted: 21625, won: 0, lost: 0 }}
              currency="EUR"
            />
          </>
        ) : (
          <>
            <PageHeader
              title="Engagements"
              description="Chaque promesse a un responsable, une échéance et une preuve."
            />
            <CommitmentCards />
          </>
        )}
      </div>
      <figcaption>
        Interface Relay · Données de démonstration · Lecture seule
      </figcaption>
    </figure>
  );
}

export default function ProductPreview() {
  const [view, setView] = useState("pipeline");
  const title =
    view === "pipeline"
      ? "Opportunités"
      : view === "relations"
        ? "Personnes"
        : "Engagements";
  const path =
    view === "pipeline"
      ? "/app/deals"
      : view === "relations"
        ? "/app/people"
        : "/app/commitments";
  return (
    <Tabs.Root
      value={view}
      onValueChange={setView}
      className={styles.productExplorer}
    >
      <Tabs.List
        className={styles.explorerTabs}
        aria-label="Choisir un aperçu du produit"
      >
        <Tabs.Trigger value="pipeline">
          <LayoutDashboard size={16} />
          Vos opportunités
        </Tabs.Trigger>
        <Tabs.Trigger value="relations">
          <Users size={16} />
          Vos relations
        </Tabs.Trigger>
        <Tabs.Trigger value="realisation">
          <CheckCheck size={16} />
          Vos engagements
        </Tabs.Trigger>
      </Tabs.List>
      <div className={styles.actualPreviewScroll}>
        <div className={styles.actualPreview} inert>
          <SidebarProvider interactive={false} className={styles.previewShell}>
            <AppSidebarView
              workspace={workspace}
              workspaces={[workspace]}
              user={{ id: "preview-user", email: "marie@relay.example" }}
              objects={[]}
              switchWorkspace={noop}
              path={path}
              onSignOut={noop}
              persistPreferences={false}
            />
            <div className={styles.realUI}>
              <header className="sb-topbar">
                <PanelLeft size={18} />
                <span className="sb-topbar-divider" />
                <span className="sb-breadcrumb-workspace">
                  {workspace.name}
                </span>
                <span className="sb-breadcrumb-slash">/</span>
                <span className="sb-breadcrumb-current">{title}</span>
                <span className={styles.actualExample}>
                  Données de démonstration
                </span>
              </header>
              <div className="page-content">
                <Tabs.Content value="pipeline">
                  <PageHeader
                    title="Opportunités"
                    description="Votre pipeline commercial, de la qualification à la signature."
                    action={
                      <button className="button primary" disabled>
                        <Plus size={15} />
                        Nouvelle opportunité
                      </button>
                    }
                  />
                  <div
                    className={recordStyles.quickViews}
                    aria-label="Vues rapides"
                  >
                    <button aria-pressed="true">Toutes les opportunités</button>
                    <button>Mon pipeline</button>
                    <button>Sans responsable</button>
                  </div>
                  <div className="toolbar">
                    <span className="search">
                      <Search size={15} />
                      <input placeholder="Rechercher" readOnly />
                    </span>
                    <span className="pill">3 opportunités</span>
                    <div className="segmented">
                      <button>Tableau</button>
                      <button className="active">Pipeline</button>
                    </div>
                    <button className="button small" disabled>
                      Exporter CSV
                    </button>
                    <button className="button small" disabled>
                      Importer CSV / Excel
                    </button>
                  </div>
                  <div className="toolbar">
                    <label>
                      Pipeline
                      <select defaultValue="commercial">
                        <option value="commercial">Pipeline commercial</option>
                      </select>
                    </label>
                    <button className="button small" disabled>
                      Paramètres du pipeline
                    </button>
                  </div>
                  <RecordBoard
                    rows={deals}
                    members={members}
                    readonly
                    busy={false}
                    onOpen={noop}
                    onCreate={noop}
                    onMove={async () => {}}
                  />
                </Tabs.Content>
                <Tabs.Content value="relations">
                  <PageHeader
                    title="Personnes"
                    description="Les personnes avec qui vous échangez. Retrouvez leurs coordonnées et le fil de la relation."
                    action={
                      <button className="button primary" disabled>
                        <Plus size={15} />
                        Nouvelle personne
                      </button>
                    }
                  />
                  <div className="toolbar">
                    <span className="pill">3 personnes</span>
                    <div className="segmented">
                      <button className="active">Tableau</button>
                      <button>Répertoire</button>
                    </div>
                  </div>
                  <RecordTable
                    rows={people}
                    columns={["display_name", "email"]}
                    slug="people"
                    onOpen={noop}
                  />
                </Tabs.Content>
                <Tabs.Content value="realisation">
                  <PageHeader
                    title="Engagements"
                    description="Chaque promesse a un responsable, une échéance et une preuve."
                    action={
                      <button className="button primary" disabled>
                        <Plus size={15} />
                        Ajouter
                      </button>
                    }
                  />
                  <div className="toolbar">
                    <span className="pill">2 éléments</span>
                    <select defaultValue="all" aria-label="Statut">
                      <option value="all">Tous les statuts</option>
                    </select>
                  </div>
                  <CommitmentCards />
                </Tabs.Content>
              </div>
            </div>
          </SidebarProvider>
        </div>
      </div>
      <p className={styles.actualCaption}>
        Interface réelle de Relay, en lecture seule · Données de démonstration
      </p>
    </Tabs.Root>
  );
}
