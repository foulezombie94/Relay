import spawn from "cross-spawn";
import { validEndpoint } from "./oauth-provider.mjs";

async function run(program, args, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      shell: false,
      stdio: capture ? ["ignore", "pipe", "ignore"] : "inherit",
    });
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output += chunk;
      if (output.length > 1024 * 1024) child.kill();
    });
    child.once("error", () =>
      reject(
        new Error(
          `Installez ${program === "claude" ? "Claude Code" : "Codex"} et rendez sa commande disponible dans le terminal.`,
        ),
      ),
    );
    child.once("close", (code) => resolve({ code, output }));
  });
}
function nativeURL(client, output) {
  if (client === "codex") {
    try {
      const entry = JSON.parse(output);
      return entry.transport?.type === "streamable_http" ? entry.transport.url : undefined;
    } catch {
      return undefined;
    }
  }
  return /^\s*Type:\s*http\s*$/im.test(output)
    ? output.match(/^\s*URL:\s*(https?:\/\/\S+)\s*$/im)?.[1]
    : undefined;
}
/** Install native HTTP OAuth; this package never owns a persistent token store. */
export async function installNative(endpoint, client, execute = run) {
  if (!["claude", "codex"].includes(client))
    throw new Error("Choisissez --client claude ou --client codex.");
  const url = validEndpoint(endpoint).href;
  const existing = await execute(
    client,
    ["mcp", "get", "zyliad", ...(client === "codex" ? ["--json"] : [])],
    true,
  );
  if (existing.code === 0 && nativeURL(client, existing.output) === url) return { reused: true };
  if (existing.code === 0) {
    // Migrate only our own legacy bridge at this exact origin. Do not replace
    // another server or a native connection pointing at a different issuer.
    if (
      !existing.output.includes(url) ||
      !/(?:zyliad-mcp|zyliad-mcp-1\.0\.0\.tgz)/.test(existing.output)
    )
      throw new Error(
        "Le nom zyliad est déjà configuré autrement. Vérifiez cette entrée avant de la remplacer.",
      );
    if (client === "claude") {
      const removed = await execute(client, ["mcp", "remove", "zyliad"]);
      if (removed.code !== 0) throw new Error("Impossible de remplacer l’ancien pont Zyliad.");
    }
  }
  const added = await execute(
    client,
    client === "claude"
      ? ["mcp", "add", "--scope", "user", "--transport", "http", "zyliad", url]
      : ["mcp", "add", "zyliad", "--url", url],
  );
  if (added.code !== 0)
    throw new Error(
      "Installation incomplète. Vérifiez la configuration du client avant de réessayer.",
    );
  return { reused: false };
}
