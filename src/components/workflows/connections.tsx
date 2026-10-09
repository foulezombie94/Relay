"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Link2, Plus } from "lucide-react";
import Link from "next/link";
import { request, useWorkspace } from "../providers/data-provider";
import { ErrorMessage } from "../ui";
import styles from "./workflows.module.css";
export type Destination = { id: string; name: string; kind: "slack" | "webhook"; enabled: boolean };
export function useDestinations() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ["workflow-destinations", workspace.id],
    queryFn: () => request<{ data: Destination[] }>(`/api/${workspace.id}/automation/config`),
  });
}
export function WorkflowConnections() {
  const { workspace } = useWorkspace(),
    q = useDestinations();
  const [kind, setKind] = useState<"slack" | "webhook">("slack"),
    [name, setName] = useState(""),
    [url, setUrl] = useState(""),
    [secret, setSecret] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const admin = ["owner", "admin"].includes(workspace.role);
  async function save() {
    setBusy(true);
    setError("");
    try {
      await request(`/api/${workspace.id}/automation/config`, "POST", {
        action: "destination",
        name,
        kind,
        url,
        ...(secret ? { secret } : {}),
      });
      setUrl("");
      setSecret("");
      setName("");
      await q.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.connections}>
      <div className={styles.intro}>
        <Link2 size={26} />
        <div>
          <h3>Des connexions explicites, pour des actions réelles.</h3>
          <p>
            Gmail, Outlook et les calendriers utilisent le compte qui publie le workflow. Les
            destinations Slack et API sont gérées par les administrateurs.
          </p>
        </div>
        <Link href="/app/integrations">Comptes connectés →</Link>
      </div>
      <ErrorMessage error={q.error} />
      {error && <div className="alert error">{error}</div>}
      <div className={styles.workflowList}>
        {q.data?.data.map((d) => (
          <article className={styles.workflowRow} key={d.id}>
            <strong>{d.name}</strong>
            <span>{d.kind === "slack" ? "Slack" : "Webhook HTTPS"}</span>
            <span>{d.enabled ? "Active" : "Désactivée"}</span>
            {admin && (
              <button
                className="button small"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await request(`/api/${workspace.id}/automation/config`, "POST", {
                      action: "toggle",
                      id: d.id,
                      enabled: !d.enabled,
                    });
                    await q.refetch();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Action impossible.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {d.enabled ? "Désactiver" : "Activer"}
              </button>
            )}
          </article>
        ))}
      </div>
      {admin && (
        <form
          className={styles.connectionForm}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h3>
            <KeyRound size={18} /> Nouvelle destination
          </h3>
          <label>
            Nom
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Service
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="slack">Slack · webhook entrant</option>
              <option value="webhook">API · webhook HTTPS</option>
            </select>
          </label>
          <label>
            URL secrète
            <input
              type="url"
              autoComplete="off"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={
                kind === "slack"
                  ? "https://hooks.slack.com/services/…"
                  : "https://api.exemple.com/relay"
              }
            />
          </label>
          {kind === "webhook" && (
            <label>
              Jeton Bearer, si nécessaire
              <input
                type="password"
                autoComplete="new-password"
                maxLength={1000}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
            </label>
          )}
          <p className="caption">
            Les secrets sont chiffrés côté serveur et ne sont jamais renvoyés à l’interface. HTTPS
            public uniquement, sans redirection.
          </p>
          <button className="button primary" disabled={busy}>
            <Plus size={15} />
            Enregistrer
          </button>
        </form>
      )}
    </div>
  );
}
export function WorkflowHook({ id }: { id?: string }) {
  const { workspace } = useWorkspace();
  const [result, setResult] = useState<{ secret: string; endpoint: string } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className={styles.help}>
      <strong>Réception authentifiée</strong>
      <p>
        Enregistrez le workflow, générez une clé puis publiez. Le formulaire ou l’API doit signer
        chaque requête ; le secret n’apparaît qu’une fois.
      </p>
      <button
        type="button"
        className="button small"
        disabled={!id || busy}
        onClick={async () => {
          if (
            result &&
            !window.confirm("Remplacer la clé invalidera l’ancienne connexion. Continuer ?")
          )
            return;
          setBusy(true);
          setError("");
          try {
            setResult(
              await request(`/api/${workspace.id}/automation/config`, "POST", {
                action: "hook",
                workflow_id: id,
              }),
            );
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Enregistrez le déclencheur avant de générer une clé.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <KeyRound size={14} />
        Générer / remplacer la clé
      </button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <label>
            Endpoint
            <input readOnly value={result.endpoint} onFocus={(e) => e.target.select()} />
          </label>
          <label>
            Secret · à copier maintenant
            <input readOnly value={result.secret} onFocus={(e) => e.target.select()} />
          </label>
          <Link href="/doc?article=automatisations">Format et signature des requêtes →</Link>
        </>
      )}
    </div>
  );
}
