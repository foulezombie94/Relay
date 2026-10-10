import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
// Report only a filename and rule name, never a matched credential.
const patterns: [string, RegExp][] = [
  ["google-access-token", /ya29\.[A-Za-z0-9_-]{30,}/],
  ["google-refresh-token", /1\/\/[A-Za-z0-9_-]{30,}/],
  ["slack-token", /xox[baprs]-[A-Za-z0-9-]{20,}/],
  ["supabase-secret", /sb_secret_[A-Za-z0-9_-]{20,}/],
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  [
    "serialized-credential",
    /["'](?:access_token|refresh_token|client_secret|api_key|bot_token)["']\s*:\s*["'][A-Za-z0-9_./+-]{30,}["']/,
  ],
];
const secretNames = [
  "GOOGLE_CLIENT_SECRET",
  "MICROSOFT_CLIENT_SECRET",
  "ZOOM_CLIENT_SECRET",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "INTEGRATION_ENCRYPTION_KEY",
  "INTEGRATION_VAULT_KEYS",
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
  "BETTER_STACK_SOURCE_TOKEN",
];
const secrets = secretNames
  .map((name) => process.env[name])
  .filter((value): value is string => !!value && value.length >= 12);
let scanned = 0;
const failures: string[] = [];
async function scan(file: string) {
  const info = await stat(file);
  if (info.isDirectory()) {
    for (const child of await readdir(file)) await scan(path.join(file, child));
    return;
  }
  if (!/\.(js|json|txt|log|html|map|snap)$/.test(file)) return;
  scanned++;
  const content = await readFile(file, "utf8");
  for (const [name, pattern] of patterns)
    if (pattern.test(content)) failures.push(`${file}: ${name}`);
  if (secrets.some((secret) => content.includes(secret)))
    failures.push(`${file}: configured-server-secret`);
}
const targets = process.argv
  .slice(2)
  .map((target) =>
    target === "--bundles"
      ? process.env.VERCEL === "1"
        ? ".next/static"
        : process.platform === "win32"
          ? `${process.env.RELAY_BUILD_DIR ?? ".next-build"}/static`
          : ".next-production/static"
      : target,
  );
if (!targets.length) throw new Error("Specify bundles or captured logs to scan.");
for (const file of targets) await scan(file);
if (!scanned) throw new Error("No artifacts were scanned.");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else console.log(`Secret boundaries OK: ${scanned} artifacts scanned.`);
