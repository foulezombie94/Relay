import "server-only";
import { ApiError, databaseError } from "@/lib/api/context";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  services,
  serviceId,
  hasRequiredScopes,
  requestedScopes,
  callbackOrigin,
  type Service,
} from "./services";
import { seal, unseal } from "./crypto";
import { providerFailure } from "./provider-errors";
export { seal, unseal, state, digest } from "./crypto";
export type Provider = Service;
export function provider(value: string): Service {
  try {
    return serviceId(value);
  } catch {
    throw new ApiError("Fournisseur inconnu.");
  }
}
export function config(p: Service, origin?: string) {
  const google = services[p].family === "google";
  const zoom = services[p].family === "zoom";
  const clientId = zoom
    ? process.env.ZOOM_CLIENT_ID
    : google
      ? process.env.GOOGLE_CLIENT_ID
      : process.env.MICROSOFT_CLIENT_ID;
  const secret = zoom
    ? process.env.ZOOM_CLIENT_SECRET
    : google
      ? process.env.GOOGLE_CLIENT_SECRET
      : process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !secret)
    throw new ApiError(
      "Ajoutez les identifiants OAuth du fournisseur dans la configuration serveur.",
      503,
    );
  const tenant = process.env.MICROSOFT_TENANT || "common";
  if (!/^(common|organizations|consumers|[0-9a-fA-F-]{36})$/.test(tenant))
    throw new ApiError("MICROSOFT_TENANT invalide.", 503);
  let base: string;
  try {
    base = callbackOrigin(process.env.APP_URL, origin, process.env.NODE_ENV === "production");
  } catch {
    throw new ApiError("APP_URL doit correspondre à une origine HTTPS en production.", 503);
  }
  return {
    clientId,
    secret,
    authorize: zoom
      ? "https://zoom.us/oauth/authorize"
      : google
        ? "https://accounts.google.com/o/oauth2/v2/auth"
        : "https://login.microsoftonline.com/" + tenant + "/oauth2/v2.0/authorize",
    token: zoom
      ? "https://zoom.us/oauth/token"
      : google
        ? "https://oauth2.googleapis.com/token"
        : "https://login.microsoftonline.com/" + tenant + "/oauth2/v2.0/token",
    scope: requestedScopes(p).join(" "),
    redirect: base + "/api/oauth/" + p + "/callback",
  };
}
export type Tokens = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope: string;
  email: string;
};
const tokenResponse = z.object({
  access_token: z.string().min(1).max(20000),
  refresh_token: z.string().min(1).max(20000).optional(),
  expires_in: z.number().positive().max(864000),
  scope: z.string().optional(),
  token_type: z
    .string()
    .refine((t) => t.toLowerCase() === "bearer")
    .optional(),
});
export async function exchange(p: Service, fields: Record<string, string>) {
  const c = config(p);
  let response: Response;
  try {
    response = await fetch(c.token, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(p === "zoom"
          ? {
              Authorization: "Basic " + Buffer.from(c.clientId + ":" + c.secret).toString("base64"),
            }
          : {}),
      },
      body: new URLSearchParams({
        ...(p === "zoom" ? {} : { client_id: c.clientId, client_secret: c.secret }),
        ...fields,
      }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ApiError("Le fournisseur est indisponible. Réessayez la connexion.", 502);
  }
  if (!response.ok)
    throw new ApiError(
      "L’autorisation du fournisseur a expiré ou a été refusée. Reconnectez le compte.",
      409,
    );
  const parsed = tokenResponse.safeParse(await boundedProviderJSON(response, 65536));
  if (!parsed.success) throw new ApiError("Réponse OAuth invalide.", 502);
  return parsed.data;
}
type SavedConnection = {
  id: string;
  encrypted_tokens: string;
  revision: number;
};
async function saved(client: SupabaseClient, w: string, p: Service) {
  const { data, error } = await client.rpc("integration_get", { w, p });
  databaseError(error);
  if (!data?.encrypted_tokens)
    throw new ApiError("Connectez ce service dans les intégrations.", 409);
  return data as SavedConnection;
}
export async function connection(client: SupabaseClient, w: string, p: Service) {
  let data = await saved(client, w, p);
  let tokens = unseal<Tokens>(data.encrypted_tokens);
  if (!hasRequiredScopes(p, (tokens.scope || "").split(/\s+/).filter(Boolean)))
    throw new ApiError("Les permissions sont insuffisantes. Reconnectez ce service.", 409);
  if (tokens.expires_at < Date.now() + 60000) {
    if (!tokens.refresh_token)
      throw new ApiError("Reconnectez ce service pour renouveler son autorisation.", 409);
    const claimedRevision = data.revision;
    const claim = await client.rpc("integration_refresh_claim", {
      w,
      p,
      expected_revision: data.revision,
    });
    databaseError(claim.error);
    if (!claim.data)
      throw new ApiError(
        "Le compte est en cours de renouvellement. Réessayez dans quelques instants.",
        409,
      );
    try {
      const fresh = await exchange(p, {
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        scope: config(p).scope,
      });
      tokens = {
        ...tokens,
        ...fresh,
        refresh_token: fresh.refresh_token || tokens.refresh_token,
        scope: fresh.scope || tokens.scope,
        expires_at: Date.now() + fresh.expires_in * 1000,
      };
      if (!hasRequiredScopes(p, tokens.scope.split(/\s+/).filter(Boolean)))
        throw new ApiError("Les permissions ont changé. Reconnectez ce service.", 409);
      const finish = await client.rpc("integration_refresh_finish", {
        w,
        p,
        expected_revision: data.revision,
        encrypted: seal(tokens),
        permissions: tokens.scope.split(/\s+/).filter(Boolean),
      });
      databaseError(finish.error);
      if (!finish.data) {
        data = await saved(client, w, p);
        tokens = unseal<Tokens>(data.encrypted_tokens);
      }
    } finally {
      await client.rpc("integration_refresh_finish", {
        w,
        p,
        expected_revision: claimedRevision,
        encrypted: null,
        permissions: [],
      });
    }
  }
  return { id: data.id, tokens };
}
export async function storeTokens(
  client: SupabaseClient,
  w: string,
  p: Service,
  tokens: Tokens,
  oauthHash: string,
) {
  const { error } = await client.rpc("integration_save", {
    w,
    p,
    mail: tokens.email,
    encrypted: seal(tokens),
    permissions: tokens.scope.split(/\s+/).filter(Boolean),
    oauth_hash: oauthHash,
  });
  databaseError(error);
}
export async function externalJson(
  url: string,
  token: string,
  init: RequestInit = {},
  responseLimit = 2000000,
  // Provider schemas are validated at the adapters; this boundary accepts their
  // heterogeneous JSON shapes without allowing caller-selected network hosts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    ![
      "gmail.googleapis.com",
      "www.googleapis.com",
      "openidconnect.googleapis.com",
      "graph.microsoft.com",
      "meet.googleapis.com",
      "api.zoom.us",
    ].includes(parsed.hostname)
  )
    throw new ApiError("Adresse fournisseur invalide.");
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: "Bearer " + token },
      cache: "no-store",
      redirect: "error",
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
    });
  } catch {
    throw new ApiError("Le fournisseur est indisponible. Réessayez plus tard.", 502);
  }
  if (!response.ok) {
    // Only known error codes influence the message; never expose provider payloads or tokens.
    const payload: unknown = await boundedProviderJSON(response, 65536).catch(() => null);
    const apiName =
      parsed.hostname === "gmail.googleapis.com"
        ? "Gmail"
        : parsed.hostname === "www.googleapis.com" && parsed.pathname.startsWith("/calendar/")
          ? "Google Calendar"
          : parsed.hostname === "graph.microsoft.com"
            ? "Microsoft Graph"
            : "Google";
    const failure = providerFailure(response.status, payload, apiName);
    throw new ApiError(failure.message, failure.status);
  }
  if (response.status === 202 || response.status === 204) return {};
  const maximum =
    parsed.hostname === "gmail.googleapis.com" &&
    /^\/gmail\/v1\/users\/me\/messages\/[^/]+\/attachments\/[^/]+$/.test(parsed.pathname)
      ? 28000000
      : 2000000;
  if (!Number.isSafeInteger(responseLimit) || responseLimit < 1024 || responseLimit > maximum) {
    await response.body?.cancel();
    throw new ApiError("Limite fournisseur invalide.");
  }
  return boundedProviderJSON(response, responseLimit);
}
async function boundedProviderJSON(response: Response, limit: number) {
  if (!response.body) throw new ApiError("Réponse fournisseur vide.", 502);
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      text += decoder.decode(chunk.value, { stream: !chunk.done });
      if (text.length > limit) throw new ApiError("Réponse fournisseur trop volumineuse.", 413);
      if (chunk.done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return JSON.parse(text);
}
