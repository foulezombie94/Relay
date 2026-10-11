"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { request } from "@/lib/api/request";
import type { IntegrationId, SafeConnection } from "@/lib/integrations/platform/contracts";
import { connectionMessages } from "@/lib/integrations/platform/catalog";
import type {
  MarketplaceSnapshot,
  MarketplaceAvailability,
} from "@/lib/integrations/platform/marketplace";
import { Modal, ErrorMessage, date } from "../ui";
import styles from "./apps.module.css";

type Review = { id: string; action: string; input: unknown; source: string; expiresAt: string };
const policyFields = [
  ["read", "Lecture"],
  ["create", "Création"],
  ["update", "Modification"],
  ["send", "Envoi"],
  ["delete", "Suppression"],
] as const;

export function GoogleConsent({
  app,
  busy,
  onClose,
  onConnect,
}: {
  app: MarketplaceAvailability;
  busy: boolean;
  onClose: () => void;
  onConnect: (write: boolean) => void;
}) {
  const [write, setWrite] = useState(false);
  const scopes = write ? app.writeScopes : app.scopes;
  return (
    <Modal
      open
      onClose={onClose}
      title="Connecter Google"
      description="Choisissez les accès de cette fonctionnalité avant de continuer chez Google."
    >
      <p>
        La connexion est partagée avec vos apps Google. Seules les permissions de cette
        fonctionnalité sont demandées maintenant.
      </p>
      <label className={styles.syncToggle}>
        <input
          type="checkbox"
          checked={write}
          disabled={busy || app.id === "google-meet"}
          onChange={(event) => setWrite(event.target.checked)}
        />
        <span>
          Autoriser aussi les actions d’écriture
          <small>
            Les envois, invitations et suppressions sensibles demandent une confirmation.
          </small>
        </span>
      </label>
      <p className={styles.caption}>
        Google Meet demande l’écriture Calendar pour créer le lien de réunion. Drive et Sheets
        utilisent drive.file : ce scope inclut l’écriture des fichiers partagés, même en mode
        consultation dans Zyliad.
      </p>
      <h3>Permissions demandées</h3>
      <ul className={styles.scopeList}>
        {scopes.map((scope) => (
          <li key={scope}>{scope}</li>
        ))}
      </ul>
      <div className={styles.connectionActions}>
        <button className="button" disabled={busy} onClick={onClose}>
          Annuler
        </button>
        <button
          className="button primary"
          disabled={busy || !app.configured}
          onClick={() => onConnect(write)}
        >
          {busy ? "Ouverture…" : "Continuer avec Google"}
        </button>
      </div>
    </Modal>
  );
}

export function PlatformConnection({
  connection,
  integration,
  snapshot,
  workspaceId,
  admin,
  writable,
  onReconnect,
  onChanged,
}: {
  connection: SafeConnection;
  integration: IntegrationId;
  snapshot: MarketplaceSnapshot;
  workspaceId: string;
  admin: boolean;
  writable: boolean;
  onReconnect: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const base = `/api/${workspaceId}/integration-platform/${connection.id}`;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const [disconnect, setDisconnect] = useState(false),
    [review, setReview] = useState<Review | null>(null);
  const [calendarId, setCalendarId] = useState("primary");
  const [calendars, setCalendars] = useState<{ id: string; summary: string }[]>([]);
  const [calendarPage, setCalendarPage] = useState<string | undefined>();
  const [search, setSearch] = useState(""),
    [searchPage, setSearchPage] = useState<string | undefined>();
  const [results, setResults] = useState<{ id: string; title: string; detail?: string }[] | null>(
    null,
  );
  const initial = snapshot.policies.find((row) => row.integration === integration);
  const [policy, setPolicy] = useState({
    read: initial?.can_read ?? false,
    create: initial?.can_create ?? false,
    update: initial?.can_update ?? false,
    send: initial?.can_send ?? false,
    delete: initial?.can_delete ?? false,
  });
  const usable = writable && connection.status === "connected";
  const resource =
    integration === "gmail"
      ? "gmail:inbox"
      : integration === "google-drive"
        ? "drive:shared"
        : integration === "google-calendar"
          ? `calendar:${calendarId}`
          : null;
  const sync = useQuery({
    queryKey: ["integration-resource", workspaceId, connection.id, resource],
    enabled: !!resource && usable,
    queryFn: async () =>
      z
        .object({ enabled: z.boolean(), last_sync_at: z.string().nullable().optional() })
        .parse(await request(`${base}?resource=${encodeURIComponent(resource!)}`)),
  });
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }
  async function execute(action: string, input: Record<string, unknown>) {
    const result = z.object({ status: z.literal("succeeded"), data: z.unknown() }).parse(
      await request(base, "POST", {
        operation: "execute",
        action,
        input,
        correlationId: crypto.randomUUID(),
      }),
    );
    return result.data;
  }
  async function loadCalendars(next?: string) {
    const result = z
      .object({
        items: z.array(z.object({ id: z.string(), summary: z.string() })),
        nextPageToken: z.string().optional(),
      })
      .parse(await execute("calendar.list_calendars", next ? { pageToken: next } : {}));
    setCalendars((previous) =>
      next
        ? [
            ...previous,
            ...result.items.filter((item) => !previous.some((row) => row.id === item.id)),
          ]
        : result.items,
    );
    setCalendarPage(result.nextPageToken);
  }
  async function find(next?: string) {
    const input = { query: search, ...(next ? { pageToken: next } : {}) };
    if (integration === "gmail") {
      const page = z
        .object({
          threads: z.array(z.object({ id: z.string(), snippet: z.string().optional() })),
          nextPageToken: z.string().optional(),
        })
        .parse(await execute("gmail.search", input));
      setResults(
        page.threads.map((row) => ({
          id: row.id,
          title: "Conversation Gmail",
          detail: row.snippet ?? row.id,
        })),
      );
      setSearchPage(page.nextPageToken);
    } else {
      const page = z
        .object({
          files: z.array(
            z.object({ id: z.string(), name: z.string(), mimeType: z.string().optional() }),
          ),
          nextPageToken: z.string().optional(),
        })
        .parse(
          await execute(
            integration === "google-drive" ? "drive.search_files" : "sheets.list_spreadsheets",
            input,
          ),
        );
      setResults(page.files.map((row) => ({ id: row.id, title: row.name, detail: row.mimeType })));
      setSearchPage(page.nextPageToken);
    }
  }
  const commands = snapshot.commands.filter((row) => row.connection_id === connection.id);
  const audit = snapshot.audit.filter((row) => row.connection_id === connection.id).slice(0, 20);
  return (
    <div className={styles.connectionPanel}>
      <div className={styles.connectionHeading}>
        <h3>Votre connexion Google</h3>
        <span className={styles.installedBadge}>{connectionMessages[connection.status]}</span>
      </div>
      <p className={styles.account}>{connection.email || connection.external_account_name}</p>
      <p className={styles.caption}>
        Dernière synchronisation :{" "}
        {connection.last_sync_at ? date(connection.last_sync_at) : "Pas encore effectuée"}
      </p>
      {connection.error_code && (
        <p role="status">
          Cette connexion nécessite une intervention. Reconnectez le compte si ses permissions ont
          été retirées.
        </p>
      )}
      <ErrorMessage error={error ? new Error(error) : sync.error} />
      {message && (
        <p className="alert info" role="status">
          {message}
        </p>
      )}
      <div className={styles.connectionActions}>
        <button
          className="button small"
          disabled={busy || !usable}
          onClick={() =>
            void run(async () => {
              await request(base, "POST", { operation: "health" });
              setMessage("La connexion répond correctement.");
            })
          }
        >
          Vérifier la connexion
        </button>
        <button className="button small" disabled={busy || !writable} onClick={onReconnect}>
          Reconnecter / ajouter des permissions
        </button>
        <button
          className="button small"
          disabled={busy || !writable || ["disconnected", "revoked"].includes(connection.status)}
          onClick={() => setDisconnect(true)}
        >
          Déconnecter
        </button>
      </div>
      <details className={styles.manageSection}>
        <summary>Permissions accordées et apps actives</summary>
        <p>{connection.enabled_integrations.join(", ")}</p>
        <ul className={styles.scopeList}>
          {connection.granted_scopes.map((scope) => (
            <li key={scope}>{scope}</li>
          ))}
        </ul>
        <p className={styles.caption}>
          Une déconnexion coupe toutes les fonctionnalités qui utilisent ce compte Google.
        </p>
      </details>
      {integration === "google-calendar" && (
        <section className={styles.manageSection}>
          <h4>Calendrier à synchroniser</h4>
          <button
            className="button small"
            disabled={busy || !usable}
            onClick={() => void run(() => loadCalendars())}
          >
            Choisir un calendrier
          </button>
          {calendars.length > 0 && (
            <label className={styles.field}>
              Calendrier
              <select
                value={calendarId}
                disabled={busy}
                onChange={(event) => setCalendarId(event.target.value)}
              >
                <option value="primary">Calendrier principal</option>
                {calendars
                  .filter((row) => row.id !== "primary")
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.summary}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {calendarPage && (
            <button
              className="button small"
              disabled={busy}
              onClick={() => void run(() => loadCalendars(calendarPage))}
            >
              Plus de calendriers
            </button>
          )}
        </section>
      )}
      {resource && (
        <section className={styles.manageSection}>
          <h4>Synchronisation de cette ressource</h4>
          <label className={styles.syncToggle}>
            <input
              type="checkbox"
              checked={sync.data?.enabled ?? false}
              disabled={busy || !usable || !sync.data}
              onChange={(event) => {
                const enabled = event.target.checked;
                void run(async () => {
                  await request(base, "POST", { operation: "configure_sync", resource, enabled });
                  await sync.refetch();
                  setMessage(
                    enabled
                      ? "Ressource sélectionnée. Vous pouvez lancer la synchronisation."
                      : "Synchronisation désactivée pour cette ressource.",
                  );
                });
              }}
            />
            <span>
              Autoriser la synchronisation
              <small>Uniquement la ressource sélectionnée. Aucun import global automatique.</small>
            </span>
          </label>
          <button
            className="button primary small"
            disabled={busy || !usable || !sync.data?.enabled}
            onClick={() =>
              void run(async () => {
                await request(base, "POST", { operation: "sync", resource });
                setMessage("Synchronisation ajoutée à la file de traitement.");
              })
            }
          >
            Synchroniser
          </button>
          <p className={styles.caption}>
            Le worker doit être actif. Le renouvellement automatique des notifications est encore en
            préparation ; lancez une synchronisation manuelle si nécessaire.
          </p>
        </section>
      )}
      {["gmail", "google-drive", "google-sheets"].includes(integration) && (
        <section className={styles.manageSection}>
          <h4>
            {integration === "gmail"
              ? "Rechercher des conversations"
              : "Rechercher des fichiers partagés"}
          </h4>
          <form
            className={styles.connectionActions}
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => find());
            }}
          >
            <input
              aria-label="Recherche dans le compte connecté"
              disabled={busy}
              maxLength={integration === "gmail" ? 1000 : 300}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setSearchPage(undefined);
              }}
            />
            <button
              className="button small"
              disabled={busy || !usable || (integration === "gmail" && !search.trim())}
            >
              Rechercher
            </button>
          </form>
          {results && (
            <ul className={styles.resultList}>
              {results.length ? (
                results.map((row) => (
                  <li key={row.id}>
                    <strong>{row.title}</strong>
                    <span>{row.detail}</span>
                  </li>
                ))
              ) : (
                <li>Aucun résultat accessible.</li>
              )}
            </ul>
          )}
          {searchPage && (
            <button
              className="button small"
              disabled={busy || !usable}
              onClick={() => void run(() => find(searchPage))}
            >
              Résultats suivants
            </button>
          )}
        </section>
      )}
      <section className={styles.manageSection}>
        <h4>Permissions des actions IA et automatisations</h4>
        <p className={styles.caption}>
          Ces règles protègent le nouveau framework. Le branchement à l’assistant et aux workflows
          historiques reste en préparation.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await request(`/api/${workspaceId}/integration-platform`, "PATCH", {
                integration,
                ...policy,
              });
              setMessage("Permissions enregistrées.");
            });
          }}
        >
          <div className={styles.permissionGrid}>
            {policyFields.map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={policy[key]}
                  disabled={!admin || busy}
                  onChange={(event) =>
                    setPolicy((previous) => ({ ...previous, [key]: event.target.checked }))
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <p className={styles.caption}>
            Toujours demander avant un envoi ou une suppression. Seuls les administrateurs peuvent
            modifier ces règles.
          </p>
          {admin && (
            <button className="button small" disabled={busy}>
              Enregistrer les permissions
            </button>
          )}
        </form>
      </section>
      <section className={styles.manageSection}>
        <h4>Actions à confirmer</h4>
        {commands
          .filter((command) => command.status === "proposed")
          .map((command) => (
            <div className={styles.reviewRow} key={command.id}>
              <span>
                {command.action}
                <small>Expire : {date(command.expires_at)}</small>
              </span>
              <button
                className="button small"
                disabled={busy || !writable || Date.parse(command.expires_at) <= clock}
                onClick={() =>
                  void run(async () => {
                    const proposal = z
                      .object({
                        action: z.string(),
                        input: z.unknown(),
                        source: z.string(),
                        expiresAt: z.string(),
                      })
                      .parse(await request(`${base}?command=${command.id}`));
                    setReview({ id: command.id, ...proposal });
                  })
                }
              >
                Examiner
              </button>
            </div>
          ))}
        {!commands.some((command) => command.status === "proposed") && (
          <p className={styles.caption}>Aucune action en attente.</p>
        )}
        {commands.some((command) => command.status === "unknown") && (
          <p role="status">
            Une action a un résultat incertain. Vérifiez auprès du fournisseur avant de la relancer.
          </p>
        )}
      </section>
      <details className={styles.manageSection}>
        <summary>Historique des actions</summary>
        <ul className={styles.resultList}>
          {audit.length ? (
            audit.map((entry) => (
              <li key={entry.id}>
                <strong>
                  {entry.action} · {entry.result}
                </strong>
                <span>
                  {entry.source} · {date(entry.created_at)}
                </span>
              </li>
            ))
          ) : (
            <li>Aucune action enregistrée.</li>
          )}
        </ul>
      </details>
      <Modal
        open={disconnect}
        onClose={() => !busy && setDisconnect(false)}
        title="Déconnecter le compte Google"
        description="Cette opération coupe toutes les apps Google liées à ce compte."
      >
        <ErrorMessage error={error ? new Error(error) : null} />
        <p>
          Les jobs seront annulés et la révocation sera traitée par le worker avant destruction des
          credentials. L’historique sera conservé.
        </p>
        <button className="button" disabled={busy} onClick={() => setDisconnect(false)}>
          Annuler
        </button>{" "}
        <button
          className="button primary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await request(base, "DELETE", { confirm: true });
              setDisconnect(false);
              setMessage("Compte bloqué localement. Révocation distante en cours.");
            })
          }
        >
          Confirmer la déconnexion
        </button>
      </Modal>
      <Modal
        open={!!review}
        onClose={() => !busy && setReview(null)}
        title="Confirmer cette action"
        description="La confirmation concerne uniquement les paramètres affichés ci-dessous."
      >
        <ErrorMessage error={error ? new Error(error) : null} />
        {review && (
          <>
            <p>
              {review.action} · {review.source}
            </p>
            <pre className={styles.reviewInput}>{JSON.stringify(review.input, null, 2)}</pre>
            <div className={styles.connectionActions}>
              {(["reject", "approve"] as const).map((operation) => (
                <button
                  key={operation}
                  className={`button ${operation === "approve" ? "primary" : ""}`}
                  disabled={busy || Date.parse(review.expiresAt) <= clock}
                  onClick={() =>
                    void run(async () => {
                      await request(base, "POST", { operation, commandId: review.id });
                      setReview(null);
                      setMessage(operation === "approve" ? "Action exécutée." : "Action refusée.");
                    })
                  }
                >
                  {operation === "approve" ? "Confirmer et exécuter" : "Refuser"}
                </button>
              ))}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
