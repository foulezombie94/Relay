"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarDays,
  CreditCard,
  Folder,
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
import { Badge, ErrorMessage, date, Loading, Modal } from "../ui";
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
import { GoogleConsent, PlatformConnection } from "../integrations/platform-connection";
import {
  marketplaceSnapshotSchema,
  appConnection,
  connectionInstalled,
  connectionNeedsAttention,
} from "@/lib/integrations/platform/marketplace";
import type { IntegrationId } from "@/lib/integrations/platform/contracts";
import styles from "../integrations/apps.module.css";

const categoryIcons = {
  communication: Mail,
  calendars: CalendarDays,
  calling: Video,
  automations: Workflow,
  files: Folder,
  sales: CreditCard,
};
type Filter = "all" | "installed" | "attention" | "available" | AppCategory;

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
  const [consent, setConsent] = useState<string | null>(null);
  const [legacyDisconnect, setLegacyDisconnect] = useState<string | null>(null);
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
  const platform = useQuery({
    queryKey: ["integration-platform", workspace.id],
    queryFn: async () =>
      marketplaceSnapshotSchema.parse(await request(`/api/${workspace.id}/integration-platform`)),
  });
  const apps = appCatalog.filter((app) =>
    providers ? providers.includes(app.id) : !embedded || app.id !== "zapier",
  );
  const isInstalled = (id: string) =>
    connectionInstalled(appConnection(platform.data, id)?.status) ||
    (id === "zapier"
      ? !!zapier.data?.data.some((key) => !key.revoked_at && Date.parse(key.expires_at) > clock)
      : q.data?.data.some(
          (connector) => connector.provider === id && connector.status === "connected",
        ) === true);
  const needsAttention = (id: string) =>
    connectionNeedsAttention(appConnection(platform.data, id)?.status) ||
    q.data?.data.some((row) => row.provider === id && connectionNeedsAttention(row.status)) ===
      true;
  const availability = (id: string) => platform.data?.apps.find((app) => app.id === id);
  const cardStatus = (id: string) => {
    if (needsAttention(id)) return "À vérifier";
    if (isInstalled(id)) return "Installed";
    if (id === "zapier") return zapier.data?.configured ? "Disponible" : "Configuration requise";
    if (
      availability(id)?.configured ||
      q.data?.data.some((row) => row.provider === id && row.configured)
    )
      return "Disponible";
    if (availability(id)?.implemented || q.data?.data.some((row) => row.provider === id))
      return "Configuration requise";
    return "En développement";
  };
  const installedApps = apps.filter((app) => isInstalled(app.id));
  const selectedApp = apps.find((app) => app.id === search.get("app"));
  const connector = q.data?.data.find((item) => item.provider === selectedApp?.id);
  const selectedAvailability = selectedApp && availability(selectedApp.id);
  const selectedConnection = selectedApp && appConnection(platform.data, selectedApp.id);
  const usePlatform =
    !!selectedAvailability?.implemented &&
    (!!selectedConnection ||
      (selectedAvailability.configured && connector?.status !== "connected"));
  function appHref(id?: string) {
    const params = new URLSearchParams(search.toString());
    params.delete("connection_error");
    params.delete("connected");
    if (id) params.set("app", id);
    else params.delete("app");
    return (
      (embedded || pathname === "/app/settings" ? "/app/integrations" : pathname) +
      (params.size ? "?" + params.toString() : "")
    );
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
  async function connect(p: string, write = false, framework = false) {
    setBusy(p);
    setError("");
    setMessage("");
    try {
      const r = await request<{ url: string }>(
        framework
          ? `/api/${workspace.id}/integration-platform/connect`
          : "/api/" + workspace.id + "/oauth/" + p,
        "POST",
        framework
          ? { integration: p, write, returnPath: embedded ? "/app/settings" : "/app/integrations" }
          : {},
      );
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
        (filter === "installed"
          ? isInstalled(app.id)
          : filter === "attention"
            ? needsAttention(app.id)
            : filter === "available"
              ? cardStatus(app.id) === "Disponible"
              : app.category === filter)) &&
      `${app.name} ${app.description} ${categoryName(app.category)} Zyliad`
        .toLocaleLowerCase("fr")
        .includes(normalizedTerm),
  );
  const pageTitle =
    filter === "all"
      ? "All apps"
      : filter === "installed"
        ? "Installed apps"
        : filter === "attention"
          ? "Needs attention"
          : filter === "available"
            ? "Available apps"
            : categoryName(filter);
  const installationPending =
    q.isPending || platform.isPending || (admin && !embedded && zapier.isPending);

  return (
    <div className={`${styles.page} ${embedded ? styles.embedded : ""}`}>
      <ErrorMessage error={q.error} />
      <ErrorMessage error={platform.error} />
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
          busy={!!busy || installationPending}
          canInstall={selectedApp.id === "zapier" ? admin : workspace.role !== "viewer"}
          needsSetup={
            selectedApp.id === "zapier"
              ? !zapier.data?.configured
              : usePlatform
                ? !selectedAvailability?.configured
                : !connector?.configured
          }
          comingSoon={
            !selectedAvailability?.implemented && !connector && selectedApp.id !== "zapier"
          }
          onInstall={() => {
            if (selectedApp.id === "zapier" || isInstalled(selectedApp.id)) {
              document
                .getElementById("app-configure")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            } else if (usePlatform && selectedAvailability?.configured) setConsent(selectedApp.id);
            else if (connector?.configured) void connect(selectedApp.id);
          }}
        >
          {selectedApp.id === "zapier" ? (
            <ZapierConnection />
          ) : installationPending ? (
            <Loading />
          ) : usePlatform && selectedConnection && platform.data ? (
            <PlatformConnection
              key={`${workspace.id}:${selectedConnection.id}:${selectedApp.id}`}
              connection={selectedConnection}
              integration={selectedApp.id as IntegrationId}
              snapshot={platform.data}
              workspaceId={workspace.id}
              admin={admin}
              writable={workspace.role !== "viewer"}
              onReconnect={() => setConsent(selectedApp.id)}
              onChanged={() => platform.refetch()}
            />
          ) : usePlatform ? (
            <div className={styles.setupNotice}>
              <strong>Connexion Google partagée</strong>
              <p>
                Connectez cette fonctionnalité pour accéder à ses permissions et à ses données
                autorisées. Les autres apps Google demandent leur propre consentement
                supplémentaire.
              </p>
            </div>
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
                      onClick={() => setLegacyDisconnect(connector.provider)}
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
            <div className={styles.setupNotice}>
              <strong>
                {selectedAvailability?.implemented
                  ? "Configuration requise"
                  : "Connecteur en développement"}
              </strong>
              <p>
                {selectedAvailability?.implemented
                  ? "Votre administrateur doit configurer et valider la plateforme Google avant activation. Aucun secret ne doit être saisi dans cette page."
                  : "Cette app est dans le store. Son connecteur n’est pas encore disponible : ajouter une clé API ne l’activera pas."}
              </p>
              {admin && !!selectedAvailability?.missing.length && (
                <details>
                  <summary>Configuration administrateur</summary>
                  <p>
                    Variables serveur : {selectedAvailability.missing.join(", ")}. À configurer sur
                    Vercel et Railway ; ne remplacez pas la clé de chiffrement des connexions
                    historiques.
                  </p>
                  <code>/api/integration-oauth/google/{workspace.id}/callback</code>
                  <p>La validation OAuth réelle reste nécessaire avant activation générale.</p>
                </details>
              )}
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
                <button
                  type="button"
                  aria-pressed={filter === "available"}
                  onClick={() => setFilter("available")}
                >
                  <Grid2X2 size={16} />
                  Available
                  <span>{apps.filter((app) => cardStatus(app.id) === "Disponible").length}</span>
                </button>
                <button
                  type="button"
                  aria-pressed={filter === "attention"}
                  onClick={() => setFilter("attention")}
                >
                  <Workflow size={16} />
                  Needs attention<span>{apps.filter((app) => needsAttention(app.id)).length}</span>
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
                            <h4>{app.name}</h4>
                            <p>By Zyliad</p>
                          </div>
                          {!installationPending && (
                            <span className={styles.installedBadge}>{cardStatus(app.id)}</span>
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
      {consent && availability(consent) && (
        <GoogleConsent
          key={consent}
          app={availability(consent)!}
          busy={!!busy}
          onClose={() => !busy && setConsent(null)}
          onConnect={(write) => void connect(consent, write, true)}
        />
      )}
      <Modal
        open={!!legacyDisconnect}
        onClose={() => !busy && setLegacyDisconnect(null)}
        title="Déconnecter cette app"
        description="Cette opération coupe la connexion de ce service pour votre compte."
      >
        <p>
          Les données déjà importées seront conservées. Révoquez aussi le consentement chez le
          fournisseur si nécessaire.
        </p>
        <button className="button" disabled={!!busy} onClick={() => setLegacyDisconnect(null)}>
          Annuler
        </button>{" "}
        <button
          className="button primary"
          disabled={!!busy}
          onClick={() => {
            if (legacyDisconnect)
              void action(legacyDisconnect, "DELETE").then(() => setLegacyDisconnect(null));
          }}
        >
          Confirmer la déconnexion
        </button>
      </Modal>
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
