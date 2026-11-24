import "server-only";
import { lookup } from "node:dns/promises";
import { isIP, BlockList, type LookupFunction } from "node:net";
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
type Destination = Awaited<ReturnType<typeof resolveWorkflowDestination>>;
type PinnedOptions = {
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  maxBytes: number;
  timeoutMs: number;
};
/**
 * DNS lookup that always answers with the address already checked. Node asks for a list
 * (`all: true`) when it races IPv4 and IPv6 (autoSelectFamily, on by default), and for a
 * single address otherwise: both shapes must be answered or the connection fails.
 */
export function pinnedLookup(chosen: Destination["chosen"]): LookupFunction {
  return (_hostname, options, callback) =>
    options?.all
      ? callback(null, [{ address: chosen.address, family: chosen.family }])
      : callback(null, chosen.address, chosen.family);
}
/**
 * One HTTPS exchange with an already validated destination. The socket connects to the
 * checked address (no second DNS resolution), redirects are not followed, and the
 * response size and total duration are bounded.
 */
function pinnedRequest({ url, chosen }: Destination, options: PinnedOptions) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(
      url,
      {
        method: options.method,
        headers: options.headers,
        lookup: pinnedLookup(chosen),
      },
      (res) => {
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
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
    const timer = setTimeout(
      () => req.destroy(new Error("Délai fournisseur dépassé.")),
      options.timeoutMs,
    );
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end(options.body);
  });
}
export async function workflowPost(
  value: string,
  payload: unknown,
  headers: Record<string, string> = {},
  resolved?: Destination,
) {
  const destination = resolved ?? (await resolveWorkflowDestination(value));
  const body = JSON.stringify(payload);
  if (Buffer.byteLength(body) > 65536) throw new Error("Contenu externe trop volumineux.");
  return pinnedRequest(destination, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(body)),
      ...headers,
    },
    body,
    maxBytes: 65536,
    timeoutMs: 15000,
  });
}
/**
 * GET of a public HTTPS document chosen by a third party (OAuth client metadata, for
 * one), under the same network boundary as outgoing workflow calls.
 */
export async function publicGet(
  value: string,
  { maxBytes, timeoutMs, headers }: Pick<PinnedOptions, "maxBytes" | "timeoutMs" | "headers">,
) {
  const destination = await resolveWorkflowDestination(value);
  return pinnedRequest(destination, { method: "GET", headers, maxBytes, timeoutMs });
}
