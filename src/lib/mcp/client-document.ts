import "server-only";
import { isIP } from "node:net";
import { z } from "zod";
import { adminDb } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api/context";
import { publicGet } from "@/lib/integrations/workflow-http";
import { redirectUri } from "./oauth-validation";

// OAuth Client ID Metadata Documents: the client_id is an HTTPS URL serving the
// client's metadata. Only that document is fetched, with SSRF limits: HTTPS on the
// default port, no credentials, public addresses only, no redirect, 5 s, 10 KiB.

export const clientIdUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    try {
      const u = new URL(value);
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !u.hash &&
        !u.port &&
        u.pathname.length > 1 &&
        isIP(u.hostname.replace(/^\[|\]$/g, "")) === 0
      );
    } catch {
      return false;
    }
  }, "client_id must be an HTTPS metadata document URL.");
export const clientId = z.union([z.uuid(), clientIdUrl]);

const loopbackHosts = ["127.0.0.1", "[::1]", "localhost"];
function portlessLoopback(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "http:" &&
      loopbackHosts.includes(u.hostname) &&
      !u.port &&
      !u.username &&
      !u.password &&
      !u.hash
    );
  } catch {
    return false;
  }
}
// Native clients (Claude Code, for one) publish loopback redirects without a port:
// RFC 8252 §7.3 lets them pick any free port when the authorization starts.
const documentRedirectUri = z
  .string()
  .max(2000)
  .refine(
    (value) => redirectUri.safeParse(value).success || portlessLoopback(value),
    "Invalid redirect URI.",
  );

/**
 * Redirect URIs to store for a metadata-document client. A port-less loopback entry
 * admits the requested loopback URI that differs from it only by its port.
 */
export function documentRedirects(declared: string[], requested?: string) {
  if (!requested || declared.includes(requested)) return declared;
  let u: URL;
  try {
    u = new URL(requested);
  } catch {
    return declared;
  }
  if (u.protocol !== "http:" || !loopbackHosts.includes(u.hostname) || !u.port) return declared;
  u.port = "";
  if (!declared.filter(portlessLoopback).includes(u.href)) return declared;
  return [requested, ...declared].slice(0, 5);
}

const documentSchema = z
  .object({
    client_id: z.string(),
    client_name: z.string().trim().min(1).max(100).optional(),
    redirect_uris: z.array(documentRedirectUri).min(1).max(5),
    token_endpoint_auth_method: z.literal("none").optional(),
  })
  .strip();

// The document URL is chosen by an unknown client. It goes through the same network
// boundary as outgoing workflow calls (security audit ZY-04): public addresses only,
// connection pinned to the checked address, no redirect, bounded size and duration.
async function fetchDocument(url: string) {
  const u = new URL(url);
  const response = await publicGet(url, {
    headers: { Accept: "application/json" },
    maxBytes: 10240,
    timeoutMs: 5000,
  }).catch(() => null);
  if (!response || response.status < 200 || response.status >= 300)
    throw new ApiError("Client metadata unavailable.", 400, "invalid_client");
  let parsed: z.infer<typeof documentSchema>;
  try {
    parsed = documentSchema.parse(JSON.parse(response.body));
  } catch {
    throw new ApiError("Invalid client metadata.", 400, "invalid_client");
  }
  // The document must describe itself: its client_id is exactly its own URL.
  if (parsed.client_id !== url)
    throw new ApiError("Client metadata mismatch.", 400, "invalid_client");
  return { client_name: parsed.client_name ?? u.hostname, redirect_uris: parsed.redirect_uris };
}

async function documentDb(operation: "upsert" | "resolve", payload: Record<string, unknown>) {
  const { data, error } = await adminDb().rpc("mcp_client_document", { operation, payload });
  if (error) throw new ApiError("Service MCP temporairement indisponible.", 503);
  if (data?.error)
    throw new ApiError(
      "Client MCP refusé.",
      data.error === "rate_limited" ? 429 : 400,
      data.error === "rate_limited" ? "rate_limited" : "invalid_client",
    );
  return z.object({ client_id: z.uuid() }).parse(data).client_id;
}

/**
 * Returns the stored client UUID. A metadata URL is fetched and refreshed when an
 * authorization starts; token and revocation requests only resolve the stored client.
 */
export async function resolveClientId(
  id: string,
  mode: "authorize" | "resolve",
  rateLimitKey?: string,
  redirect?: string,
) {
  if (z.uuid().safeParse(id).success) return id;
  const url = clientIdUrl.parse(id);
  if (mode === "resolve") return documentDb("resolve", { url });
  const document = await fetchDocument(url);
  return documentDb("upsert", {
    url,
    rate_limit_key: rateLimitKey,
    client_name: document.client_name,
    redirect_uris: documentRedirects(document.redirect_uris, redirect),
  });
}
