"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Webhook,
} from "lucide-react";
import { request, useWorkspace } from "../providers/data-provider";
import { Modal, ErrorMessage, Loading } from "../ui";
import { Toggle } from "../ui/controls";
import { apiScopes, scopeLabels, webhookEventLabels, webhookEvents } from "@/lib/domain/public-api";
import styles from "./developer-api.module.css";

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
};
type Endpoint = {
  id: string;
  url: string;
  description: string;
  events: string[];
  object_ids: string[] | null;
  enabled: boolean;
  consecutive_failures: number;
  disabled_reason: string | null;
  last_delivery_at: string | null;
};
type Delivery = {
  id: string;
  endpoint_id: string;
  event_type: string;
  status: string;
  attempts: number;
  response_status: number | null;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
};
const day = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
const statusLabels: Record<string, string> = {
  queued: "En attente",
  delivering: "En cours",
  retry: "Nouvelle tentative",
  delivered: "Livré",
  dead: "Échec",
};

function SecretReveal({
  secret,
  label,
  onDone,
}: {
  secret: string;
  label: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.secret}>
      <strong>{label}</strong>
      <p>Copiez-la maintenant : elle ne sera plus jamais affichée.</p>
      <div className={styles.secretValue}>
        <code>{secret}</code>
        <button
          type="button"
          className="button small"
          onClick={() =>
            void navigator.clipboard
              .writeText(secret)
              .then(() => setCopied(true))
              .catch(() => toast.error("Copie impossible"))
          }
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copiée" : "Copier"}
        </button>
      </div>
      <div className="dialog-footer">
        <button className="button primary" onClick={onDone}>
          J’ai copié la valeur
        </button>
      </div>
    </div>
  );
}

function ApiKeys() {
  const { workspace } = useWorkspace();
  const cache = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["records:read"]);
  const [expires, setExpires] = useState<string>("365");
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["rows", workspace.id, "api-keys"],
    queryFn: () => request<{ data: ApiKey[] }>(`/api/${workspace.id}/api-keys`),
  });
  async function create() {
    setBusy(true);
    try {
      const result = await request<{ secret: string }>(`/api/${workspace.id}/api-keys`, "POST", {
        name,
        scopes,
        expires_in_days: expires === "never" ? null : Number(expires),
      });
      setSecret(result.secret);
      await cache.invalidateQueries({ queryKey: ["rows", workspace.id, "api-keys"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Création impossible.");
    } finally {
      setBusy(false);
    }
  }
  const keys = q.data?.data ?? [];
  return (
    <section className={styles.block} aria-labelledby="api-keys-title">
      <header className={styles.blockHead}>
        <div>
          <h3 id="api-keys-title">
            <KeyRound size={16} /> Clés API
          </h3>
          <p>
            Accédez à vos fiches, tâches et notes depuis vos outils via l’API REST. Une clé agit
            avec vos droits, dans cet espace uniquement.
          </p>
        </div>
        <div className={styles.headActions}>
          <a className="button small" href="/api/v1/openapi.json" target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Spécification OpenAPI
          </a>
          <button
            className="button primary small"
            onClick={() => {
              setCreating(true);
              setSecret(null);
              setName("");
              setScopes(["records:read"]);
            }}
          >
            <Plus size={14} /> Nouvelle clé
          </button>
        </div>
      </header>
      <ErrorMessage error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : keys.length === 0 ? (
        <p className={styles.empty}>Aucune clé. Créez-en une pour connecter un outil à Zyliad.</p>
      ) : (
        <div className={styles.list}>
          {keys.map((key) => {
            const expired = !!key.expires_at && new Date(key.expires_at) < new Date();
            const state = key.revoked_at ? "revoked" : expired ? "expired" : "active";
            return (
              <div className={styles.item} key={key.id} data-state={state}>
                <div className={styles.itemMain}>
                  <strong>{key.name}</strong>
                  <code>{key.prefix}…</code>
                  <div className={styles.chips}>
                    {key.scopes.map((scope) => (
                      <span key={scope} title={scopeLabels[scope as keyof typeof scopeLabels]}>
                        {scope}
                      </span>
                    ))}
                  </div>
                </div>
                <dl className={styles.meta}>
                  <div>
                    <dt>Dernière utilisation</dt>
                    <dd>{day(key.last_used_at)}</dd>
                  </div>
                  <div>
                    <dt>Expiration</dt>
                    <dd>{key.expires_at ? day(key.expires_at) : "Jamais"}</dd>
                  </div>
                </dl>
                <span className={styles.pill} data-state={state}>
                  {state === "active" ? "Active" : state === "revoked" ? "Révoquée" : "Expirée"}
                </span>
                <button
                  className="icon-button"
                  aria-label={`Révoquer ${key.name}`}
                  disabled={state !== "active"}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        `Révoquer « ${key.name} » ? Les outils qui l’utilisent perdront l’accès immédiatement.`,
                      )
                    )
                      return;
                    try {
                      await request(`/api/${workspace.id}/api-keys?id=${key.id}`, "DELETE");
                      await cache.invalidateQueries({
                        queryKey: ["rows", workspace.id, "api-keys"],
                      });
                      toast.success("Clé révoquée");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Révocation impossible.");
                    }
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <details className={styles.example}>
        <summary>Exemple d’appel</summary>
        <pre>{`curl ${typeof window === "undefined" ? "" : window.location.origin}/api/v1/records?object=people \\
  -H "Authorization: Bearer zk_…"

curl -X POST ${typeof window === "undefined" ? "" : window.location.origin}/api/v1/records \\
  -H "Authorization: Bearer zk_…" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{"object":"people","values":{"display_name":"Alice Martin","email":"alice@exemple.fr"}}'`}</pre>
      </details>
      {creating && (
        <Modal
          open
          onClose={() => setCreating(false)}
          title={secret ? "Clé créée" : "Nouvelle clé API"}
          description={
            secret
              ? "Conservez cette clé dans un gestionnaire de secrets."
              : "Accordez uniquement les permissions nécessaires."
          }
        >
          {secret ? (
            <SecretReveal secret={secret} label="Votre clé API" onDone={() => setCreating(false)} />
          ) : (
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                void create();
              }}
            >
              <label>
                Nom
                <input
                  required
                  maxLength={100}
                  autoFocus
                  placeholder="Ex. Synchronisation ERP"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <fieldset>
                <legend>Permissions</legend>
                {apiScopes.map((scope) => (
                  <label key={scope} className={styles.check}>
                    <input
                      type="checkbox"
                      checked={scopes.includes(scope)}
                      onChange={() =>
                        setScopes((current) =>
                          current.includes(scope)
                            ? current.filter((s) => s !== scope)
                            : [...current, scope],
                        )
                      }
                    />
                    <span>
                      <strong>{scopeLabels[scope]}</strong>
                      <code>{scope}</code>
                    </span>
                  </label>
                ))}
              </fieldset>
              <label>
                Expiration
                <select value={expires} onChange={(e) => setExpires(e.target.value)}>
                  <option value="30">30 jours</option>
                  <option value="90">90 jours</option>
                  <option value="365">1 an</option>
                  <option value="never">Jamais (déconseillé)</option>
                </select>
              </label>
              <div className="dialog-footer">
                <button type="button" className="button" onClick={() => setCreating(false)}>
                  Annuler
                </button>
                <button
                  className="button primary"
                  disabled={busy || !name.trim() || !scopes.length}
                >
                  {busy ? "Création…" : "Créer la clé"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </section>
  );
}

function Webhooks() {
  const { workspace, objects } = useWorkspace();
  const cache = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<{ value: string; label: string } | null>(null);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<string[]>(["record.created", "record.updated"]);
  const [objectIds, setObjectIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = ["rows", workspace.id, "webhooks", selected];
  const q = useQuery({
    queryKey: key,
    queryFn: () =>
      request<{ data: Endpoint[]; deliveries: Delivery[] }>(
        `/api/${workspace.id}/webhooks${selected ? "?endpoint=" + selected : ""}`,
      ),
    refetchInterval: 15000,
  });
  const refresh = () => cache.invalidateQueries({ queryKey: ["rows", workspace.id, "webhooks"] });
  async function action(body: Record<string, unknown>) {
    setBusy(true);
    try {
      return await request<{ secret?: string; event_id?: string }>(
        `/api/${workspace.id}/webhooks`,
        "POST",
        body,
      );
    } finally {
      setBusy(false);
    }
  }
  const endpoints = q.data?.data ?? [];
  return (
    <section className={styles.block} aria-labelledby="webhooks-title">
      <header className={styles.blockHead}>
        <div>
          <h3 id="webhooks-title">
            <Webhook size={16} /> Webhooks
          </h3>
          <p>
            Recevez un appel HTTPS signé à chaque changement dans votre CRM. Livraison au moins une
            fois, 8 tentatives avec délai croissant.
          </p>
        </div>
        <button
          className="button primary small"
          onClick={() => {
            setCreating(true);
            setSecret(null);
            setUrl("");
            setDescription("");
          }}
        >
          <Plus size={14} /> Nouveau webhook
        </button>
      </header>
      <ErrorMessage error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : endpoints.length === 0 ? (
        <p className={styles.empty}>Aucun webhook configuré.</p>
      ) : (
        <div className={styles.list}>
          {endpoints.map((endpoint) => (
            <div
              className={styles.item}
              key={endpoint.id}
              data-state={endpoint.enabled ? "active" : "revoked"}
              data-selected={selected === endpoint.id}
            >
              <div className={styles.itemMain}>
                <button
                  className={styles.urlButton}
                  onClick={() => setSelected(selected === endpoint.id ? null : endpoint.id)}
                >
                  {endpoint.url}
                </button>
                {endpoint.description && <small>{endpoint.description}</small>}
                <div className={styles.chips}>
                  {endpoint.events.map((event) => (
                    <span key={event}>{event}</span>
                  ))}
                </div>
                {endpoint.disabled_reason && (
                  <small className={styles.warning}>{endpoint.disabled_reason}</small>
                )}
              </div>
              <Toggle
                label="Actif"
                checked={endpoint.enabled}
                disabled={busy}
                onChange={async (enabled: boolean) => {
                  try {
                    await request(`/api/${workspace.id}/webhooks`, "PATCH", {
                      id: endpoint.id,
                      values: { enabled },
                    });
                    await refresh();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Modification impossible.");
                  }
                }}
              />
              <div className={styles.rowActions}>
                <button
                  className="button small"
                  disabled={busy || !endpoint.enabled}
                  onClick={async () => {
                    try {
                      await action({ action: "ping", id: endpoint.id });
                      toast.success("Événement de test envoyé");
                      setSelected(endpoint.id);
                      await refresh();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Test impossible.");
                    }
                  }}
                >
                  <Send size={13} /> Tester
                </button>
                <button
                  className="icon-button"
                  aria-label="Régénérer le secret"
                  title="Régénérer le secret"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "Régénérer le secret ? L’ancien cessera immédiatement d’être utilisé pour signer.",
                      )
                    )
                      return;
                    try {
                      const result = await action({ action: "rotate", id: endpoint.id });
                      if (result.secret)
                        setSecret({ value: result.secret, label: "Nouveau secret de signature" });
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Rotation impossible.");
                    }
                  }}
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Supprimer ${endpoint.url}`}
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm("Supprimer ce webhook et son historique de livraison ?"))
                      return;
                    try {
                      await request(`/api/${workspace.id}/webhooks?id=${endpoint.id}`, "DELETE");
                      if (selected === endpoint.id) setSelected(null);
                      await refresh();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Suppression impossible.");
                    }
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {endpoints.length > 0 && (
        <div className={styles.deliveries}>
          <h4>
            Dernières livraisons
            {selected ? " · " + (endpoints.find((e) => e.id === selected)?.url ?? "") : ""}
          </h4>
          {(q.data?.deliveries ?? []).length === 0 ? (
            <p className={styles.empty}>Aucune livraison pour le moment.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Événement</th>
                  <th>Statut</th>
                  <th>Tentatives</th>
                  <th>Réponse</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {(q.data?.deliveries ?? []).map((delivery) => (
                  <tr key={delivery.id}>
                    <td>
                      <code>{delivery.event_type}</code>
                    </td>
                    <td>
                      <span className={styles.pill} data-state={delivery.status}>
                        {statusLabels[delivery.status] ?? delivery.status}
                      </span>
                    </td>
                    <td>{delivery.attempts}</td>
                    <td title={delivery.last_error ?? undefined}>
                      {delivery.response_status ?? (delivery.last_error ? "Erreur" : "—")}
                    </td>
                    <td>
                      {new Date(delivery.created_at).toLocaleString("fr-FR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {(creating || secret) && (
        <Modal
          open
          onClose={() => {
            setCreating(false);
            setSecret(null);
          }}
          title={secret ? "Secret de signature" : "Nouveau webhook"}
          description={
            secret
              ? "Vérifiez l’en-tête Zyliad-Signature de chaque appel avec ce secret."
              : "Choisissez l’URL de destination et les événements à recevoir."
          }
        >
          {secret ? (
            <SecretReveal
              secret={secret.value}
              label={secret.label}
              onDone={() => {
                setSecret(null);
                setCreating(false);
              }}
            />
          ) : (
            <form
              className={styles.form}
              onSubmit={async (event) => {
                event.preventDefault();
                try {
                  const result = await action({
                    action: "create",
                    webhook: {
                      url,
                      description,
                      events,
                      ...(objectIds.length ? { object_ids: objectIds } : {}),
                    },
                  });
                  await refresh();
                  if (result.secret)
                    setSecret({ value: result.secret, label: "Secret de signature" });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Création impossible.");
                }
              }}
            >
              <label>
                URL HTTPS
                <input
                  type="url"
                  required
                  autoFocus
                  pattern="https://.*"
                  placeholder="https://exemple.fr/webhooks/zyliad"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </label>
              <label>
                Description
                <input
                  maxLength={300}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <fieldset>
                <legend>Événements</legend>
                <div className={styles.grid}>
                  {webhookEvents.map((event) => (
                    <label key={event} className={styles.check}>
                      <input
                        type="checkbox"
                        checked={events.includes(event)}
                        onChange={() =>
                          setEvents((current) =>
                            current.includes(event)
                              ? current.filter((e) => e !== event)
                              : [...current, event],
                          )
                        }
                      />
                      <span>
                        <strong>{webhookEventLabels[event]}</strong>
                        <code>{event}</code>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Objets concernés (fiches)</legend>
                <div className={styles.grid}>
                  {objects.map((object) => (
                    <label key={object.id} className={styles.check}>
                      <input
                        type="checkbox"
                        checked={objectIds.includes(object.id)}
                        onChange={() =>
                          setObjectIds((current) =>
                            current.includes(object.id)
                              ? current.filter((id) => id !== object.id)
                              : [...current, object.id],
                          )
                        }
                      />
                      <span>
                        <strong>{object.name}</strong>
                      </span>
                    </label>
                  ))}
                </div>
                <small>Aucune sélection : tous les objets.</small>
              </fieldset>
              <div className="dialog-footer">
                <button type="button" className="button" onClick={() => setCreating(false)}>
                  Annuler
                </button>
                <button className="button primary" disabled={busy || !url || !events.length}>
                  Créer le webhook
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </section>
  );
}

/** Settings › Développeurs: public API keys and outbound webhooks (administrators). */
export function DeveloperApi() {
  const { workspace } = useWorkspace();
  if (!["owner", "admin"].includes(workspace.role))
    return (
      <p className={styles.empty}>Les clés API et webhooks sont gérés par les administrateurs.</p>
    );
  return (
    <div className={styles.stack}>
      <ApiKeys />
      <Webhooks />
    </div>
  );
}
