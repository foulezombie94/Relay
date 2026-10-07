import "server-only";
import { lookup } from "node:dns/promises";
import { isIP, BlockList } from "node:net";
import { request } from "node:https";

const blocked = new BlockList();
const blockedV6 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 96],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["2002::", 16],
  ["2001::", 32],
] as const)
  blockedV6.addSubnet(address, prefix, "ipv6");
export function publicAddress(address: string) {
  const version = isIP(address);
  return (
    version !== 0 &&
    !(version === 4 ? blocked : blockedV6).check(address, version === 4 ? "ipv4" : "ipv6")
  );
}
export function workflowURL(value: string, slack = false) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password ||
    url.hash ||
    isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
    !url.hostname.includes(".") ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname) ||
    (slack && (url.hostname !== "hooks.slack.com" || !url.pathname.startsWith("/services/")))
  )
    throw new Error("Utilisez une destination HTTPS publique valide.");
  return url;
}
// The validated address is pinned for the TLS connection: a second DNS resolution
// cannot redirect the worker into a private network. Redirects are never followed.
export async function resolveWorkflowDestination(value: string, slack = false) {
  const url = workflowURL(value, slack);
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error("Destination réseau interdite.");
  const chosen = addresses.find((a) => a.family === 4) ?? addresses[0];
  return { url, chosen };
}
export async function workflowPost(
  value: string,
  payload: unknown,
  headers: Record<string, string> = {},
  resolved?: Awaited<ReturnType<typeof resolveWorkflowDestination>>,
) {
  const { url, chosen } = resolved ?? (await resolveWorkflowDestination(value));
  const body = JSON.stringify(payload);
  if (Buffer.byteLength(body) > 65536) throw new Error("Contenu externe trop volumineux.");
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...headers,
        },
        lookup: (_hostname, _options, callback) => callback(null, chosen.address, chosen.family),
      },
      (res) => {
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 65536) {
            res.destroy(new Error("Réponse trop volumineuse."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 502, body: Buffer.concat(chunks).toString("utf8") }),
        );
        res.on("error", reject);
      },
    );
    const timer = setTimeout(() => req.destroy(new Error("Délai fournisseur dépassé.")), 15000);
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end(body);
  });
}
