"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Check, Copy, ArrowUpRight, ShieldCheck } from "lucide-react";
import styles from "./installer.module.css";
import { mcpInstallationOrigin } from "@/lib/domain/mcp-installation";
function ClientLogo({ client }: { client: "claude" | "codex" }) {
  const [unavailable, setUnavailable] = useState(false);
  return unavailable ? (
    <span className={styles.logoFallback} aria-hidden="true">
      {client === "claude" ? "C" : "O"}
    </span>
  ) : (
    <Image
      unoptimized
      src={client === "claude" ? "https://claude.ai/favicon.ico" : "https://openai.com/favicon.ico"}
      alt={client === "claude" ? "Logo Claude" : "Logo OpenAI"}
      width={26}
      height={26}
      onError={() => setUnavailable(true)}
    />
  );
}
export function installationCommands(
  origin: string,
  client: "claude" | "codex",
  mode: "remote" | "npx" | "npm",
) {
  const canonical = mcpInstallationOrigin(origin);
  const url = canonical + "/api/mcp",
    archive = canonical + "/mcp/zyliad-mcp-1.1.1.tgz";
  if (mode === "remote")
    return client === "claude"
      ? `claude mcp add --scope user --transport http zyliad "${url}"`
      : `codex mcp add zyliad --url "${url}"`;
  return mode === "npx"
    ? `npx --yes "${archive}" install --client ${client} "${url}"`
    : `npm install --global "${archive}"\nzyliad-mcp install --client ${client} "${url}"`;
}
export function McpInstaller({
  compact = false,
  origin = "https://VOTRE-DOMAINE",
}: {
  compact?: boolean;
  origin?: string;
}) {
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
            <ClientLogo client={id} />
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
            ? "Installez Zyliad une seule fois. Votre client conserve la connexion et renouvelle automatiquement l’accès jusqu’à l’expiration ou la révocation de l’autorisation."
            : "Cet installateur configure la connexion HTTP native de votre client. Node.js 20+ requis ; aucun pont à reconnecter à chaque démarrage."}
        </p>
        {mode === "remote" && client === "claude" && (
          <p>
            Dans Claude Code, ouvrez <code>/mcp</code>, puis authentifiez Zyliad.
          </p>
        )}
        {client === "codex" && (
          <p>
            Codex ouvre OAuth lors de l’ajout. Utilisez <code>codex mcp login zyliad</code>{" "}
            uniquement si l’autorisation manque, expire ou est révoquée.
          </p>
        )}
        {mode !== "remote" && (
          <p>
            Si vous utilisiez l’ancien pont, exécutez cette commande une fois pour le remplacer.
            Votre client conserve ensuite l’autorisation OAuth.
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
