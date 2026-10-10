"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Grid2X2,
  Mail,
  Search,
  Video,
  Workflow,
  X,
} from "lucide-react";
import { useWorkspace, request } from "../providers/data-provider";
import { Badge, ErrorMessage, date, Loading } from "../ui";
import { ZapierConnection, type ZapierKey } from "../integrations/zapier-connection";
import { AppLogo } from "../integrations/app-logo";
import { AppDetails } from "../integrations/app-details";
import {
  appCatalog,
  appCategories,
  categoryName,
  type AppCategory,
  type Connector,
} from "../integrations/app-catalog";
import { BackgroundJob } from "../jobs/background-job";
import styles from "../integrations/apps.module.css";

const categoryIcons = {
  communication: Mail,
  calendars: CalendarDays,
  calling: Video,
  automations: Workflow,
};
type Filter = "all" | "installed" | AppCategory;

export function IntegrationsPage({
  embedded = false,
  providers,
}: { embedded?: boolean; providers?: readonly string[] } = {}) {
  const { workspace } = useWorkspace();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [clock, setClock] = useState(Date.now);
  const cache = useQueryClient();
  const search = useSearchParams();
  const pathname = usePathname();
  const admin = ["owner", "admin"].includes(workspace.role);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const q = useQuery({
    queryKey: ["connections", workspace.id],
    queryFn: () => request<{ data: Connector[] }>("/api/" + workspace.id + "/connections"),
  });
  const zapier = useQuery({
    queryKey: ["zapier-keys", workspace.id],
    enabled: admin && !embedded,
    queryFn: () =>
      request<{ data: ZapierKey[]; configured: boolean }>("/api/" + workspace.id + "/zapier"),
  });
  const apps = appCatalog.filter((app) =>
    providers ? providers.includes(app.id) : !embedded || app.id !== "zapier",
  );
  const isInstalled = (id: string) =>
    id === "zapier"
      ? !!zapier.data?.data.some((key) => !key.revoked_at && Date.parse(key.expires_at) > clock)
      : q.data?.data.some(
          (connector) => connector.provider === id && connector.status === "connected",
        ) === true;
  const installedApps = apps.filter((app) => isInstalled(app.id));
  const selectedApp = apps.find((app) => app.id === search.get("app"));
  const connector = q.data?.data.find((item) => item.provider === selectedApp?.id);
  function appHref(id?: string) {
    const params = new URLSearchParams(search.toString());
    params.delete("connection_error");
    params.delete("connected");
    if (id) params.set("app", id);
    else params.delete("app");
    return pathname + (params.size ? "?" + params.toString() : "");
  }
  async function action(p: string, method: "POST" | "DELETE" | "PATCH", enabled?: boolean) {
    setBusy(p);
    setError("");
    setMessage("");
    try {
      const r = await request<{
        queued?: boolean;
        job?: { id: string };
        data?: { synced: number; complete: boolean };
      }>(
        "/api/" + workspace.id + "/connections/" + p,
        method,
        method === "PATCH" ? { enabled } : undefined,
      );
      if (r.queued && r.job) setJobId(r.job.id);
      setMessage(
        method === "POST"
          ? r.queued
            ? "Synchronisation planifiée."
            : (r.data?.synced ?? 0) +
              (r.data?.complete
                ? " éléments importés. Synchronisation terminée."
                : " éléments importés. Cliquez sur Continuer pour importer la suite.")
          : method === "PATCH"
            ? "Préférence enregistrée."
            : "Service déconnecté. Les éléments importés sont conservés ; révoquez le consentement auprès du fournisseur si nécessaire.",
      );
      await q.refetch();
      await cache.invalidateQueries({ queryKey: ["rows", workspace.id] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible");
    } finally {
      setBusy("");
    }
  }
  async function connect(p: string) {
    setBusy(p);
    setError("");
    setMessage("");
    try {
      const r = await request<{ url: string }>("/api/" + workspace.id + "/oauth/" + p, "POST", {});
      window.location.assign(r.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion impossible");
      setBusy("");
    }
  }
  const normalizedTerm = term.trim().toLocaleLowerCase("fr");
  const visibleApps = apps.filter(
    (app) =>
      (filter === "all" ||
        (filter === "installed" ? isInstalled(app.id) : app.category === filter)) &&
      `${app.name} ${app.description} ${categoryName(app.category)} Zyliad`
        .toLocaleLowerCase("fr")
        .includes(normalizedTerm),
  );
  const pageTitle =
    filter === "all"
      ? "All apps"
      : filter === "installed"
        ? "Installed apps"
        : categoryName(filter);
  const installationPending = q.isPending || (admin && !embedded && zapier.isPending);

  return (
    <div className={`${styles.page} ${embedded ? styles.embedded : ""}`}>
      <ErrorMessage error={q.error} />
      {!embedded && <ErrorMessage error={zapier.error} />}
      {jobId && (
        <BackgroundJob
          id={jobId}
          onComplete={(data) => {
            setMessage(
              String(data.synced ?? 0) +
                " éléments importés." +
                (data.complete
                  ? " Synchronisation terminée."
                  : " Continuez pour importer la suite."),
            );
            void q.refetch();
          }}
        />
      )}
      {(error || search.get("connection_error")) && (
        <div className="alert error" role="alert">
          {error || search.get("connection_error")}
        </div>
      )}
      {(message || search.get("connected")) && (
        <div className="alert info" role="status">
          {message || search.get("connected")}
        </div>
      )}
      {selectedApp ? (
        <AppDetails
          key={workspace.id + ":" + selectedApp.id}
          app={selectedApp}
          installed={isInstalled(selectedApp.id)}
          backHref={appHref()}
          busy={!!busy || q.isPending}
          canInstall={selectedApp.id === "zapier" ? admin : workspace.role !== "viewer"}
          needsSetup={
            selectedApp.id === "zapier" ? !zapier.data?.configured : !connector?.configured
          }
          onInstall={() => {
            if (selectedApp.id === "zapier" || isInstalled(selectedApp.id)) {
              document
                .getElementById("app-configure")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            } else if (connector?.configured) void connect(selectedApp.id);
          }}
        >
          {selectedApp.id === "zapier" ? (
            <ZapierConnection />
          ) : q.isPending ? (
            <Loading />
          ) : connector ? (
            <div className={styles.connectionPanel}>
              <div className={styles.connectionHeading}>
                <h3>Votre connexion</h3>
                <Badge value={connector.status} />
              </div>
              {connector.email && <p className={styles.account}>{connector.email}</p>}
              {connector.last_sync && (
                <p className={styles.caption}>Dernier import : {date(connector.last_sync)}</p>
              )}
              {connector.last_error && (
                <div className="alert error" role="alert">
                  {connector.last_error}
                </div>
              )}
              {connector.status === "connected" && workspace.role !== "viewer" && (
                <>
                  <label className={styles.syncToggle}>
                    <input
                      type="checkbox"
                      checked={!!connector.auto_sync}
                      disabled={!!busy || !connector.worker_ready}
                      onChange={(e) => void action(connector.provider, "PATCH", e.target.checked)}
                    />
                    <span>
                      Synchronisation automatique
                      <small>Toutes les 5 minutes lorsque le service est actif.</small>
                    </span>
                  </label>
                  {!connector.worker_ready && (
                    <p className={styles.caption}>
                      La synchronisation automatique sera disponible lorsque le service de
                      synchronisation sera actif.
                    </p>
                  )}
                  <div className={styles.connectionActions}>
                    <button
                      className="button primary small"
                      disabled={!!busy}
                      onClick={() => void action(connector.provider, "POST")}
                    >
                      {busy === connector.provider
                        ? "En cours…"
                        : connector.pending
                          ? "Continuer l’import"
                          : "Synchroniser"}
                    </button>
                    <button
                      className="button small"
                      disabled={!!busy}
                      onClick={() => void action(connector.provider, "DELETE")}
                    >
                      Déconnecter
                    </button>
                  </div>
                </>
              )}
              {connector.status !== "connected" &&
                connector.configured &&
                workspace.role !== "viewer" && (
                  <button
                    className="button primary small"
                    disabled={!!busy}
                    onClick={() => void connect(connector.provider)}
                  >
                    {busy === connector.provider
                      ? "Ouverture…"
                      : connector.status === "error"
                        ? "Reconnecter"
                        : "Install app"}
                  </button>
                )}
              {!connector.configured && (
                <div className={styles.setupNotice}>
                  <strong>Configuration requise</strong>
                  <p>
                    Demandez à votre administrateur de terminer la configuration de{" "}
                    {selectedApp.name} pour autoriser la connexion.
                  </p>
                  {admin && (
                    <details>
                      <summary>Configuration administrateur</summary>
                      <p>
                        Variables serveur à renseigner : {connector.missing.join(", ")}. Conservez
                        la clé de chiffrement existante.
                      </p>
                      <p>Déclarez la redirection OAuth de ce service sous votre origine HTTPS :</p>
                      <code>/api/oauth/{connector.provider}/callback</code>
                      <a href={selectedApp.documentation} target="_blank" rel="noreferrer">
                        Documentation du fournisseur <ArrowUpRight size={12} />
                      </a>
                    </details>
                  )}
                </div>
              )}
              <p className={styles.caption}>
                Imports privés à votre compte, par lots de 100 avec reprise. Les données déjà
                importées sont conservées après déconnexion.
              </p>
            </div>
          ) : (
            <div className="alert error">
              Impossible de charger cette connexion. Actualisez la page pour réessayer.
            </div>
          )}
        </AppDetails>
      ) : (
        <>
          {!embedded && (
            <header className={styles.pageHeading}>
              <div>
                <h1>Apps</h1>
                <p>
                  Vos outils préférés, connectés à Zyliad.{" "}
                  <Link href="/doc?article=integrations">
                    Learn more <ArrowUpRight size={13} />
                  </Link>
                </p>
              </div>
              <span className={styles.catalogLabel}>
                <Grid2X2 size={14} /> App directory
              </span>
            </header>
          )}
          <section className={styles.installedSection} aria-labelledby="installed-apps-heading">
            <div className={styles.sectionHeading}>
              <h2 id="installed-apps-heading">
                Installed apps <span>{installedApps.length}</span>
              </h2>
              <button
                type="button"
                onClick={() => {
                  setFilter("installed");
                  setTerm("");
                }}
                disabled={installationPending}
              >
                View all <ChevronRight size={14} />
              </button>
            </div>
            {installationPending ? (
              <div className={styles.installedLoading}>
                <Loading />
              </div>
            ) : installedApps.length ? (
              <div className={styles.installedGrid}>
                {installedApps.slice(0, 3).map((app) => (
                  <Link key={app.id} href={appHref(app.id)} className={styles.installedApp}>
                    <AppLogo id={app.id} />
                    <strong>{app.name}</strong>
                    <BadgeCheckIcon />
                  </Link>
                ))}
              </div>
            ) : (
              <div className={styles.installedEmpty}>
                <Grid2X2 size={19} />
                <div>
                  <strong>Aucune app installée pour le moment</strong>
                  <p>Choisissez une app ci-dessous pour connecter vos outils à Zyliad.</p>
                </div>
              </div>
            )}
          </section>
          <section className={styles.browseSection} aria-labelledby="browse-apps-heading">
            <div className={styles.browseHeading}>
              <h2 id="browse-apps-heading">Browse apps</h2>
              <p>Découvrez les intégrations qui accompagnent votre travail.</p>
            </div>
            <div className={styles.search}>
              <Search size={17} />
              <input
                aria-label="Search apps"
                placeholder="Search apps"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
              {term && (
                <button type="button" aria-label="Effacer la recherche" onClick={() => setTerm("")}>
                  <X size={15} />
                </button>
              )}
            </div>
            <div className={styles.catalogLayout}>
              <nav className={styles.filters} aria-label="Filtres des apps">
                <button
                  type="button"
                  aria-pressed={filter === "all"}
                  onClick={() => setFilter("all")}
                >
                  <Grid2X2 size={16} />
                  All apps<span>{apps.length}</span>
                </button>
                <button
                  type="button"
                  aria-pressed={filter === "installed"}
                  onClick={() => setFilter("installed")}
                >
                  <Check size={16} />
                  Installed<span>{installedApps.length}</span>
                </button>
                <div className={styles.filterDivider} />
                {appCategories
                  .filter((category) => apps.some((app) => app.category === category.id))
                  .map((category) => {
                    const Icon = categoryIcons[category.id];
                    return (
                      <button
                        type="button"
                        key={category.id}
                        aria-pressed={filter === category.id}
                        onClick={() => setFilter(category.id)}
                      >
                        <Icon size={16} />
                        {category.name}
                        <span>{apps.filter((app) => app.category === category.id).length}</span>
                      </button>
                    );
                  })}
              </nav>
              <div className={styles.catalogResults}>
                <div className={styles.resultsHeading}>
                  <h3>{pageTitle}</h3>
                  <span>
                    {visibleApps.length} {visibleApps.length > 1 ? "apps" : "app"}
                  </span>
                </div>
                {filter === "installed" && installationPending ? (
                  <Loading />
                ) : visibleApps.length ? (
                  <div className={styles.appGrid}>
                    {visibleApps.map((app) => (
                      <Link key={app.id} href={appHref(app.id)} className={styles.appCard}>
                        <div className={styles.appCardHeading}>
                          <AppLogo id={app.id} />
                          <div>
                            <h4>
                              {app.name} <BadgeCheckIcon />
                            </h4>
                            <p>By Zyliad</p>
                          </div>
                          {isInstalled(app.id) && (
                            <span className={styles.installedBadge}>Installed</span>
                          )}
                        </div>
                        <p className={styles.appDescription}>{app.description}</p>
                        <div className={styles.cardFooter}>
                          <span>{categoryName(app.category)}</span>
                          <ArrowUpRight size={14} />
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className={styles.noResults}>
                    <Search size={24} />
                    <h3>
                      {filter === "installed" && !normalizedTerm
                        ? "Aucune app installée"
                        : "Aucune app trouvée"}
                    </h3>
                    <p>
                      {normalizedTerm
                        ? "Essayez un autre nom ou une autre catégorie."
                        : "Explorez le catalogue pour connecter vos outils."}
                    </p>
                    <button
                      className="button small"
                      onClick={() => {
                        setFilter("all");
                        setTerm("");
                      }}
                    >
                      Voir toutes les apps
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function BadgeCheckIcon() {
  return (
    <span
      className={styles.verified}
      title="Intégration développée par Zyliad"
      aria-label="Intégration développée par Zyliad"
    >
      <Check size={9} strokeWidth={3} />
    </span>
  );
}
