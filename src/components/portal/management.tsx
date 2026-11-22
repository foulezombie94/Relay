"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  Plus,
  Search,
  Globe,
  ArrowUpRight,
  RefreshCw,
  Pencil,
  FileText,
  Users,
  LockKeyhole,
  CalendarDays,
  List,
  LayoutGrid,
} from "lucide-react";
import { useRows, useSave, useWorkspace } from "../providers/data-provider";
import { request } from "@/lib/api/request";
import { Editor, ErrorMessage, str, type Field } from "../ui";
import { RecordPicker } from "../records/picker";
import { PortalDetails } from "../pages/portal-details";
import { portalSummarySchema, portalDate, portalInitials } from "@/lib/domain/portals";
import type { Row } from "@/lib/domain/types";
import { PortalLoading, Progress, PortalPagination } from "./shared";
import styles from "./portal.module.css";
import { DeleteButton } from "@/components/ui/delete-button";
export function PortalsPage() {
  const { workspace } = useWorkspace();
  return <PortalManagement key={workspace.id} />;
}
function PortalManagement() {
  const { workspace } = useWorkspace();
  const params = useSearchParams();
  const focus = params.get("focus");
  const [dismissed, setDismissed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<Row | true | null>(() =>
    params.get("create") === "1" && workspace.role !== "viewer" ? true : null,
  );
  const [actionError, setActionError] = useState<Error | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ q: "", page: 0, state: "all" });
  const [view, setView] = useState("grid");
  useEffect(() => {
    const timer = setTimeout(() => setFilters((value) => ({ ...value, q: search, page: 0 })), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const portals = useRows("portals", { size: 24, ...filters });
  const rows = portals.data?.data ?? [];
  const summaries = useQuery({
    queryKey: ["rows", workspace.id, "portal-summaries", rows.map((row) => row.id)],
    enabled: !!rows.length && !portals.isError,
    queryFn: async () =>
      z
        .object({ data: z.array(portalSummarySchema).max(24) })
        .parse(
          await request(
            "/api/" + workspace.id + "/portals/summary?ids=" + rows.map((row) => row.id).join(","),
          ),
        ),
    retry: false,
  });
  const { save, remove, busy } = useSave();
  const readOnly = workspace.role === "viewer";
  const chosen = rows.find((row) => row.id === (selected ?? (!dismissed ? focus : null)));
  const fields: Field[] = [
    { key: "name", label: "Nom du portail", required: true },
    { key: "enabled", label: "Activer l’accès client", type: "checkbox" },
    ...(editor === true
      ? [
          {
            key: "record_id",
            label: "Fiche CRM associée",
            required: true,
            type: "custom" as const,
            render: (initial: unknown, name: string) => (
              <RecordPicker name={name} initial={initial} required />
            ),
          },
        ]
      : []),
  ];
  return (
    <main className={styles.managementPage}>
      <header className={styles.pageHeading}>
        <div className={styles.managementTitle}>
          <span className={styles.pageIcon}>
            <Globe size={25} />
          </span>
          <div>
            <span className={styles.eyebrow}>COLLABORATION CLIENT</span>
            <h1>Portails clients</h1>
            <p>Un espace clair pour vos clients, des partages que vous maîtrisez.</p>
          </div>
        </div>
        <div className={styles.tools}>
          <Link className="button" href="/portal">
            Mes espaces clients
            <ArrowUpRight size={14} />
          </Link>
          <button className="button primary" disabled={readOnly} onClick={() => setEditor(true)}>
            <Plus size={15} />
            Créer un portail
          </button>
        </div>
      </header>
      <div className={styles.managementIntro}>
        <div>
          <span>
            <Globe size={20} />
          </span>
          <div>
            <h2>Travaillez ensemble, en toute clarté</h2>
            <p>
              Rassemblez les étapes, documents et décisions de chaque projet. Invitez vos clients et
              gardez les échanges au même endroit.
            </p>
          </div>
        </div>
        <aside>
          <LockKeyhole size={15} />
          <span>Seuls les éléments que vous partagez sont visibles par le client.</span>
        </aside>
      </div>
      <div className={styles.directoryToolbar}>
        <div className={styles.filterTabs} role="group" aria-label="État des portails">
          {[
            ["all", "Tous les portails"],
            ["active", "Actifs"],
            ["paused", "En pause"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filters.state === value}
              onClick={() => setFilters({ ...filters, state: value, page: 0 })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.tools}>
          <label className={styles.search}>
            <Search size={15} />
            <input
              aria-label="Rechercher un portail"
              maxLength={200}
              placeholder="Rechercher un portail…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button
            className="icon-button"
            aria-label="Actualiser les portails"
            onClick={() => {
              void portals.refetch();
              void summaries.refetch();
            }}
          >
            <RefreshCw size={15} />
          </button>
          <div className={styles.viewSwitch}>
            <button
              aria-label="Vue cartes"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              aria-label="Vue liste"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>
      <ErrorMessage error={portals.error ?? actionError} />
      <ErrorMessage error={summaries.error} />
      {portals.isPending ? (
        <PortalLoading />
      ) : (
        !portals.isError && (
          <>
            <div className={styles.resultCount}>
              {portals.data?.count ?? 0} portails{readOnly && <span>Lecture seule</span>}
            </div>
            {rows.length ? (
              <div className={styles.portalGrid} data-view={view}>
                {rows.map((portal, index) => {
                  const summary = !summaries.isError
                    ? summaries.data?.data.find((item) => item.id === portal.id)
                    : undefined;
                  return (
                    <article className={styles.portalCard} key={portal.id}>
                      <div className={styles.cardTop}>
                        <span className={styles.portalAvatar} data-tone={index % 4}>
                          {portalInitials(str(portal.name))}
                        </span>
                        <span className={styles.status} data-done={!!portal.enabled}>
                          <i />
                          {portal.enabled ? "Actif" : "En pause"}
                        </span>
                      </div>
                      <div className={styles.cardTitle}>
                        <span>ESPACE PARTAGÉ</span>
                        <h2>
                          <button onClick={() => setSelected(portal.id)}>{str(portal.name)}</button>
                        </h2>
                        <small>
                          <CalendarDays size={12} />
                          Créé le {portalDate(str(portal.created_at))}
                        </small>
                      </div>
                      {summary ? (
                        <>
                          <Progress summary={summary} compact />
                          <div className={styles.cardMetrics}>
                            <span>
                              <FileText size={14} />
                              {summary.document_count} documents
                            </span>
                            <span>
                              <List size={14} />
                              {summary.item_count} éléments
                            </span>
                          </div>
                        </>
                      ) : (
                        <p className={styles.muted}>
                          {summaries.isError
                            ? "Le résumé n’est pas disponible."
                            : "Chargement du résumé…"}
                        </p>
                      )}
                      <footer className={styles.cardFooter}>
                        <button
                          className={styles.manageLink}
                          onClick={() => setSelected(portal.id)}
                        >
                          <Users size={14} />
                          Gérer le partage
                          <ArrowUpRight size={13} />
                        </button>
                        <div>
                          <button
                            className="icon-button"
                            aria-label={"Modifier " + str(portal.name)}
                            disabled={readOnly}
                            onClick={() => setEditor(portal)}
                          >
                            <Pencil size={14} />
                          </button>
                          <DeleteButton
                            label={"Supprimer " + str(portal.name)}
                            title="Supprime le portail, ses accès, partages et échanges ; les fiches et documents d’origine sont conservés"
                            disabled={readOnly || busy}
                            onConfirm={async () => {
                              setActionError(null);
                              try {
                                await remove("portals", portal.id);
                              } catch (e) {
                                setActionError(
                                  e instanceof Error ? e : new Error("Suppression impossible."),
                                );
                              }
                            }}
                          />
                        </div>
                      </footer>
                    </article>
                  );
                })}
              </div>
            ) : (
              <section className={styles.emptyDirectory}>
                <div className={styles.emptyIllustration} aria-hidden="true">
                  <span>
                    <Globe size={28} />
                  </span>
                  <i>
                    <FileText size={16} />
                  </i>
                  <i>
                    <List size={16} />
                  </i>
                  <i>
                    <Users size={16} />
                  </i>
                </div>
                <h2>
                  {filters.q || filters.state !== "all"
                    ? "Aucun portail ne correspond"
                    : "Offrez à chaque client son espace"}
                </h2>
                <p>
                  {filters.q || filters.state !== "all"
                    ? "Essayez une autre recherche ou réinitialisez vos filtres."
                    : "Créez un portail lié à une fiche CRM, partagez les éléments utiles puis autorisez les adresses de vos clients."}
                </p>
                {filters.q || filters.state !== "all" ? (
                  <button
                    className="button"
                    onClick={() => {
                      setSearch("");
                      setFilters({ q: "", page: 0, state: "all" });
                    }}
                  >
                    Réinitialiser les filtres
                  </button>
                ) : (
                  <button
                    className="button primary"
                    disabled={readOnly}
                    onClick={() => setEditor(true)}
                  >
                    <Plus size={14} />
                    Créer mon premier portail
                  </button>
                )}
                <div className={styles.emptyBenefits}>
                  <div>
                    <Globe size={18} />
                    <h3>1. Créez l’espace</h3>
                    <p>Associez le portail à votre client ou à votre projet.</p>
                  </div>
                  <div>
                    <FileText size={18} />
                    <h3>2. Choisissez les partages</h3>
                    <p>Ajoutez les étapes, décisions et documents utiles.</p>
                  </div>
                  <div>
                    <Users size={18} />
                    <h3>3. Autorisez les participants</h3>
                    <p>Un administrateur définit les accès et leur expiration.</p>
                  </div>
                </div>
              </section>
            )}
            {(portals.data?.count ?? 0) > 24 && (
              <PortalPagination
                page={filters.page}
                count={portals.data?.count ?? 0}
                size={24}
                label="portails"
                onPage={(page) => setFilters({ ...filters, page })}
              />
            )}
          </>
        )
      )}
      {chosen && !portals.isError && (
        <PortalDetails
          key={chosen.id}
          portal={chosen}
          onClose={() => {
            setSelected(null);
            setDismissed(true);
          }}
        />
      )}
      {editor && (
        <Editor
          key={editor === true ? "new-portal" : editor.id}
          open
          onClose={() => setEditor(null)}
          title={editor === true ? "Créer un portail client" : "Modifier le portail"}
          fields={fields}
          initial={editor === true ? { enabled: true } : editor}
          busy={busy}
          onSave={(values) => save("portals", values, editor === true ? undefined : editor)}
        />
      )}
    </main>
  );
}
