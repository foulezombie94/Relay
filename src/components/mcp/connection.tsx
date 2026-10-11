"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace, request } from "@/components/providers/data-provider";
import { ErrorMessage, date } from "@/components/ui";
import { scopeLabels } from "@/lib/mcp/contracts";
import { McpInstaller } from "./installer";
import styles from "./mcp.module.css";
type Snapshot = {
  connections: Array<{
    id: string;
    name: string;
    scopes: string[];
    revoked_at: string | null;
    expires_at: string;
    last_used_at: string | null;
  }>;
  commands: Array<{
    id: string;
    action: string;
    values: unknown;
    status: string;
    expires_at: string;
    result: unknown;
  }>;
  audit: Array<{ action: string; result: string; created_at: string }>;
};
const actionLabels: Record<string, string> = {
  create_record: "Créer une fiche",
  update_record: "Modifier une fiche",
  create_task: "Créer une tâche",
  update_task: "Modifier une tâche",
  create_note: "Créer une note privée",
  update_note: "Modifier une note",
};
export function McpConnection() {
  const { workspace } = useWorkspace();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const q = useQuery({
    queryKey: ["mcp-connections", workspace.id],
    queryFn: () => request<{ data: Snapshot }>(`/api/${workspace.id}/mcp`),
    refetchInterval: 15000,
  });
  async function act(operation: "approve" | "reject" | "revoke", id: string) {
    if (
      operation === "revoke" &&
      !window.confirm(
        "Déconnecter cette application ? Son accès et ses propositions en attente seront révoqués immédiatement.",
      )
    )
      return;
    if (
      operation === "approve" &&
      !window.confirm("Exécuter cette modification avec les valeurs exactes affichées ?")
    )
      return;
    setBusy(true);
    setError("");
    try {
      await request(`/api/${workspace.id}/mcp`, "POST", { operation, id });
      await q.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.management}>
      <div>
        <p className={styles.eyebrow}>MCP DISTANT · OAUTH</p>
        <h2>Votre CRM dans Claude Code et Codex</h2>
        <p>
          Connectez votre compte, sélectionnez cet espace et accordez uniquement les permissions
          utiles. Les modifications proposées attendent votre validation ci-dessous.
        </p>
      </div>
      <McpInstaller compact />
      <ErrorMessage error={q.error ?? (error ? new Error(error) : null)} />
      <h3>Vos applications connectées</h3>
      {!q.isPending && !q.error && !q.data?.data.connections.length && (
        <p className="muted">
          Aucune application MCP connectée. Utilisez une des commandes ci-dessus pour commencer.
        </p>
      )}
      {q.data?.data.connections.map((c) => (
        <article className={styles.card} key={c.id}>
          <div className={styles.cardHead}>
            <strong>{c.name}</strong>
            <span>{c.revoked_at ? "Déconnecté" : "Autorisé jusqu’au " + date(c.expires_at)}</span>
          </div>
          <p>{c.scopes.map((s) => scopeLabels[s] ?? s).join(" · ")}</p>
          <div className={styles.cardHead}>
            <small>
              Dernière utilisation : {c.last_used_at ? date(c.last_used_at) : "pas encore utilisé"}
            </small>
            {!c.revoked_at && (
              <button disabled={busy} onClick={() => void act("revoke", c.id)}>
                Déconnecter
              </button>
            )}
          </div>
        </article>
      ))}
      <h3>Modifications à confirmer</h3>
      {!q.data?.data.commands.some((c) => c.status === "pending") && (
        <p className="muted">
          Aucune proposition en attente. Le MCP ne peut pas confirmer ses propres actions.
        </p>
      )}
      {q.data?.data.commands.map((c) => (
        <article className={styles.card} key={c.id}>
          <div className={styles.cardHead}>
            <strong>{actionLabels[c.action] ?? c.action}</strong>
            <span>{c.status}</span>
          </div>
          {c.status === "pending" && (
            <>
              <p>Vérifiez chaque valeur. Autorisation valable jusqu’au {date(c.expires_at)}.</p>
              <pre className={styles.parameters}>{JSON.stringify(c.values, null, 2)}</pre>
              <div className={styles.actions}>
                <button disabled={busy} onClick={() => void act("reject", c.id)}>
                  Refuser
                </button>
                <button
                  className={styles.primary}
                  disabled={busy || workspace.role === "viewer"}
                  onClick={() => void act("approve", c.id)}
                >
                  Confirmer cette modification
                </button>
              </div>
            </>
          )}
        </article>
      ))}
      <details className={styles.card}>
        <summary>Historique de vos accès et actions MCP</summary>
        {q.data?.data.audit.map((a, i) => (
          <div className={styles.audit} key={i}>
            <span>
              {a.action} · {a.result}
            </span>
            <time>{date(a.created_at)}</time>
          </div>
        ))}
      </details>
    </section>
  );
}
