"use client";
import Image from "next/image";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Check, Copy, ArrowUpRight, ShieldCheck } from "lucide-react";
import styles from "./installer.module.css";
const subscribe = () => () => {};
export function installationCommands(
  origin: string,
  client: "claude" | "codex",
  mode: "remote" | "npx" | "npm",
) {
  const url = origin + "/api/mcp",
    archive = origin + "/mcp/zyliad-mcp-1.0.0.tgz";
  if (mode === "remote")
    return client === "claude"
      ? `claude mcp add --transport http zyliad "${url}"`
      : `codex mcp add zyliad --url "${url}"\ncodex mcp login zyliad`;
  const run = mode === "npx" ? `npx --yes "${archive}" "${url}"` : `zyliad-mcp "${url}"`;
  const command =
    client === "claude"
      ? `claude mcp add --transport stdio zyliad -- ${run}`
      : `codex mcp add zyliad -- ${run}`;
  return (mode === "npm" ? `npm install --global "${archive}"\n` : "") + command;
}
export function McpInstaller({ compact = false }: { compact?: boolean }) {
  const origin = useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => "https://VOTRE-DOMAINE",
  );
  const [client, setClient] = useState<"claude" | "codex">("claude"),
    [mode, setMode] = useState<"remote" | "npx" | "npm">("remote"),
    [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState("");
  const commands = installationCommands(origin, client, mode);
  async function copy() {
    try {
      await navigator.clipboard.writeText(commands);
      setCopyError("");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError("Sélectionnez la commande ci-dessous pour la copier.");
    }
  }
  return (
    <div className={`${styles.installer} ${compact ? styles.compact : ""}`}>
      <div className={styles.clients} role="tablist" aria-label="Choisir votre client MCP">
        {(["claude", "codex"] as const).map((id) => (
          <button
            type="button"
            key={id}
            role="tab"
            aria-selected={client === id}
            aria-controls="mcp-install-panel"
            onClick={() => {
              setClient(id);
              setCopied(false);
            }}
          >
            <Image
              unoptimized
              src={
                id === "claude" ? "https://claude.ai/favicon.ico" : "https://openai.com/favicon.ico"
              }
              alt={id === "claude" ? "Logo Claude" : "Logo OpenAI"}
              width={26}
              height={26}
            />
            <span>
              {id === "claude" ? "Claude Code" : "Codex"}
              <small>{id === "claude" ? "Anthropic" : "OpenAI"}</small>
            </span>
          </button>
        ))}
        <span className={styles.badge}>
          <ShieldCheck size={14} />
          OAuth
        </span>
      </div>
      <div id="mcp-install-panel" role="tabpanel" className={styles.panel}>
        <div className={styles.modes} aria-label="Méthode de connexion">
          {(["remote", "npx", "npm"] as const).map((id) => (
            <button
              key={id}
              aria-pressed={mode === id}
              onClick={() => {
                setMode(id);
                setCopied(false);
              }}
            >
              {id === "remote" ? "Distant · recommandé" : id}
            </button>
          ))}
        </div>
        <div className={styles.terminal}>
          <div className={styles.terminalHead}>
            <span>Terminal</span>
            <button type="button" onClick={() => void copy()} aria-label="Copier la commande MCP">
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copié" : "Copier"}
            </button>
          </div>
          <pre>
            <code>{commands}</code>
          </pre>
        </div>
        {copyError && <p role="status">{copyError}</p>}
        <p>
          {mode === "remote"
            ? "Connectez-vous dans le navigateur, choisissez votre espace Zyliad et vérifiez les autorisations."
            : "Pont local officiel Zyliad vers le MCP distant. Node.js 20+ requis ; OAuth s’ouvre dans le navigateur. La connexion directe reste recommandée."}
        </p>
        {mode === "remote" && client === "claude" && (
          <p>
            Dans Claude Code, ouvrez <code>/mcp</code>, puis authentifiez Zyliad.
          </p>
        )}
        {mode !== "remote" && (
          <p>
            Le pont conserve les tokens uniquement en mémoire ; chaque redémarrage nécessite une
            nouvelle connexion.
          </p>
        )}
        <div className={styles.footer}>
          <span>Aucune clé API à copier</span>
          <Link prefetch={false} href="/mcp">
            Guide de connexion <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
