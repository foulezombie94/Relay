"use client";
import { useState } from "react";
import { ShieldCheck, LockKeyhole, ArrowRight } from "lucide-react";
import { scopeLabels } from "@/lib/mcp/contracts";
import styles from "./mcp.module.css";
type Workspace = { id: string; name: string; role: string };
export function McpConsent({
  clientName,
  requestedScopes,
  workspaces,
}: {
  clientName: string;
  requestedScopes: string[];
  workspaces: Workspace[];
}) {
  const [workspace, setWorkspace] = useState(workspaces[0]?.id ?? "");
  const [selected, setSelected] = useState(
    requestedScopes.filter((s) => ["records:read", "tasks:read", "configuration:read"].includes(s)),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const viewer = workspaces.find((w) => w.id === workspace)?.role === "viewer";
  async function consent(allow: boolean) {
    setBusy(true);
    setError("");
    try {
      const result = await fetch("/api/mcp/oauth/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace,
          scopes: selected.filter((s) => !viewer || s !== "crm:write"),
          allow,
        }),
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = await result.json();
      if (!result.ok)
        throw new Error(
          "Cette autorisation a expiré ou a été refusée. Relancez la connexion depuis votre client MCP.",
        );
      window.location.assign(body.redirect);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion impossible.");
      setBusy(false);
    }
  }
  return (
    <main className={styles.consent}>
      <div className={styles.mark}>z</div>
      <p className={styles.eyebrow}>CONNEXION MCP · ZYLIAD</p>
      <h1>Connecter votre CRM à {clientName}</h1>
      <p>
        Cette application externe demande l’accès à Zyliad. Vérifiez son nom, puis choisissez les
        données que vous souhaitez lui partager.
      </p>
      <label className={styles.field}>
        Espace de travail
        <select value={workspace} onChange={(e) => setWorkspace(e.target.value)} disabled={busy}>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className={styles.permissions}>
        <legend>Autorisations accordées</legend>
        {requestedScopes.map((scope) => (
          <label key={scope}>
            <input
              type="checkbox"
              checked={selected.includes(scope) && !(viewer && scope === "crm:write")}
              disabled={busy || (viewer && scope === "crm:write")}
              onChange={(e) =>
                setSelected((s) =>
                  e.target.checked ? [...s, scope] : s.filter((v) => v !== scope),
                )
              }
            />
            <span>{scopeLabels[scope] ?? scope}</span>
          </label>
        ))}
      </fieldset>
      <div className={styles.notice}>
        <ShieldCheck size={20} />
        <span>
          Les droits de votre compte restent applicables. Chaque modification doit être confirmée
          dans Zyliad.
        </span>
      </div>
      <div className={styles.notice}>
        <LockKeyhole size={20} />
        <span>
          Accès révocable dans Paramètres → Développeurs. Les secrets de vos intégrations ne sont
          jamais transmis à l’application.
        </span>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button disabled={busy || !workspace} onClick={() => void consent(false)}>
          Refuser
        </button>
        <button
          className={styles.primary}
          disabled={
            busy || !workspace || !selected.filter((s) => !viewer || s !== "crm:write").length
          }
          onClick={() => void consent(true)}
        >
          {busy ? "Connexion…" : "Autoriser la connexion"}
          <ArrowRight size={16} />
        </button>
      </div>
      <small>
        Seules les permissions cochées sont accordées à cet espace. Les emails et documents privés
        ne deviennent pas visibles aux autres membres.
      </small>
    </main>
  );
}
