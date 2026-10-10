"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCheck,
  FileText,
  Globe,
  LayoutGrid,
  List,
  LockKeyhole,
  MessageSquare,
  RefreshCw,
  Search,
  Plus,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { portalDirectorySchema, portalDate, portalInitials } from "@/lib/domain/portals";
import { usePortalResource } from "./use-portal-resource";
import { PortalHeader, PortalLoading, PortalError, Progress, PortalPagination } from "./shared";
import styles from "./portal.module.css";
export function PortalDirectory() {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ q: "", page: 0, state: "all" });
  const [view, setView] = useState<"grid" | "list">("grid");
  useEffect(() => {
    const timer = setTimeout(() => setFilters((value) => ({ ...value, q: search, page: 0 })), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const resource = usePortalResource(
    "/api/portal?" + new URLSearchParams({ ...filters, page: String(filters.page) }),
    portalDirectorySchema,
  );
  const data = resource.data;
  const manage = data?.manage_workspace_id
    ? "/app/portals?workspace=" + data.manage_workspace_id
    : null;
  const documents = data?.data.reduce((sum, p) => sum + p.summary.document_count, 0) ?? 0;
  const steps = data?.data.reduce((sum, p) => sum + p.summary.step_count, 0) ?? 0;
  const decisions = data?.data.reduce((sum, p) => sum + p.summary.open_decisions, 0) ?? 0;
  return (
    <div className={styles.directoryPage}>
      <PortalHeader manage={manage} />
      <main className={styles.directoryMain}>
        <div className={styles.pageHeading}>
          <div>
            <span className={styles.eyebrow}>VOTRE ESPACE DE COLLABORATION</span>
            <h1>Mes portails clients</h1>
            <p>Vos projets, vos documents et vos échanges. Tout au même endroit.</p>
          </div>
          {manage && (
            <Link className="button primary" href={manage}>
              <Plus size={15} />
              Gérer mes portails
            </Link>
          )}
        </div>
        <div className={styles.directoryStats}>
          <div>
            <Globe size={17} />
            <strong>{data ? data.count : "—"}</strong>
            <span>Portails accessibles</span>
          </div>
          <div>
            <List size={17} />
            <strong>{data ? steps : "—"}</strong>
            <span>Étapes sur cette page</span>
          </div>
          <div>
            <FileText size={17} />
            <strong>{data ? documents : "—"}</strong>
            <span>Documents sur cette page</span>
          </div>
          <div>
            <MessageSquare size={17} />
            <strong>{data ? decisions : "—"}</strong>
            <span>Décisions en cours sur cette page</span>
          </div>
        </div>
        <div className={styles.directoryToolbar}>
          <div className={styles.filterTabs} role="group" aria-label="Filtrer les portails">
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
                placeholder="Rechercher un portail…"
                maxLength={200}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button
              className="icon-button"
              aria-label="Actualiser les portails"
              onClick={resource.reload}
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
        {resource.loading ? (
          <PortalLoading />
        ) : resource.error ? (
          <PortalError error={resource.error} retry={resource.reload} />
        ) : (
          data && (
            <>
              {data.data.length ? (
                <div className={styles.portalGrid} data-view={view}>
                  {data.data.map((portal, index) => (
                    <article className={styles.portalCard} key={portal.id}>
                      <div className={styles.cardTop}>
                        <span className={styles.portalAvatar} data-tone={index % 4}>
                          {portalInitials(portal.name)}
                        </span>
                        <span className={styles.status} data-done={portal.enabled}>
                          <i />
                          {portal.enabled ? "Actif" : "En pause"}
                        </span>
                      </div>
                      <div className={styles.cardTitle}>
                        <span>
                          {portal.access === "team"
                            ? "PORTAIL DE VOTRE ÉQUIPE"
                            : "ESPACE PARTAGÉ AVEC VOUS"}
                        </span>
                        <h2>
                          {portal.enabled ? (
                            <Link href={"/portal/" + portal.id}>{portal.name}</Link>
                          ) : (
                            portal.name
                          )}
                        </h2>
                      </div>
                      <Progress summary={portal.summary} compact />
                      <div className={styles.cardMetrics}>
                        <span>
                          <FileText size={14} />
                          {portal.summary.document_count} documents
                        </span>
                        <span>
                          <MessageSquare size={14} />
                          {portal.summary.comment_count} messages
                        </span>
                      </div>
                      <div className={styles.cardDue}>
                        <CalendarDays size={13} />
                        {portal.summary.next_due_at
                          ? "Prochaine échéance : " + portalDate(portal.summary.next_due_at)
                          : "Aucune échéance partagée"}
                      </div>
                      <footer className={styles.cardFooter}>
                        <small>Activité : {portalDate(portal.summary.last_activity_at)}</small>
                        <div>
                          {portal.enabled && (
                            <button
                              className="icon-button"
                              aria-label={"Copier le lien de " + portal.name}
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(
                                    new URL(
                                      "/portal/" + portal.id,
                                      window.location.origin,
                                    ).toString(),
                                  );
                                  toast.success(
                                    "Lien copié. Seules les personnes autorisées peuvent ouvrir le portail.",
                                  );
                                } catch {
                                  toast.error("Le lien n’a pas pu être copié.");
                                }
                              }}
                            >
                              <Copy size={14} />
                            </button>
                          )}
                          {portal.can_manage && portal.workspace_id && (
                            <Link
                              href={
                                "/app/portals?workspace=" +
                                portal.workspace_id +
                                "&focus=" +
                                portal.id
                              }
                            >
                              Gérer
                              <ArrowUpRight size={13} />
                            </Link>
                          )}
                          {portal.enabled && (
                            <Link className={styles.openPortal} href={"/portal/" + portal.id}>
                              Ouvrir
                              <ArrowUpRight size={14} />
                            </Link>
                          )}
                        </div>
                      </footer>
                    </article>
                  ))}
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
                      <CheckCheck size={16} />
                    </i>
                    <i>
                      <MessageSquare size={16} />
                    </i>
                  </div>
                  <h2>
                    {filters.q || filters.state !== "all"
                      ? "Aucun portail ne correspond"
                      : "Votre prochain projet commence ici"}
                  </h2>
                  <p>
                    {filters.q || filters.state !== "all"
                      ? "Essayez une autre recherche ou affichez tous vos portails."
                      : "Retrouvez ici les espaces que votre équipe gère et ceux auxquels vous êtes invité."}
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
                  ) : manage ? (
                    <Link className="button primary" href={manage + "&create=1"}>
                      <Plus size={14} />
                      Créer mon premier portail
                    </Link>
                  ) : (
                    <p className={styles.muted}>
                      Vous attendez une invitation ? Demandez à votre interlocuteur d’autoriser
                      l’adresse de votre compte.
                    </p>
                  )}
                  <div className={styles.emptyBenefits}>
                    <div>
                      <List size={18} />
                      <h3>Suivez les étapes</h3>
                      <p>Consultez l’avancement et les échéances partagées.</p>
                    </div>
                    <div>
                      <FileText size={18} />
                      <h3>Retrouvez les documents</h3>
                      <p>Accédez aux fichiers sélectionnés pour votre projet.</p>
                    </div>
                    <div>
                      <MessageSquare size={18} />
                      <h3>Gardez le fil</h3>
                      <p>Échangez avec les participants autorisés.</p>
                    </div>
                  </div>
                </section>
              )}
              {data.count > 24 && (
                <PortalPagination
                  page={filters.page}
                  count={data.count}
                  size={24}
                  label="portails"
                  onPage={(page) => setFilters({ ...filters, page })}
                />
              )}
            </>
          )
        )}
        <div className={styles.safetyNote}>
          <LockKeyhole size={13} />
          <span>
            Chaque espace est réservé à ses participants. Un lien seul ne donne pas accès aux
            informations.
          </span>
        </div>
      </main>
    </div>
  );
}
