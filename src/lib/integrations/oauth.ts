import "server-only";
import { ApiError, databaseError } from "@/lib/api/context";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  services,
  serviceId,
  hasRequiredScopes,
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
  const clientId = google
    ? process.env.GOOGLE_CLIENT_ID
    : process.env.MICROSOFT_CLIENT_ID;
  const secret = google
    ? process.env.GOOGLE_CLIENT_SECRET
    : process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !secret)
    throw new ApiError(
      "Ajoutez les identifiants OAuth Google ou Microsoft dans la configuration serveur.",
      503,
    );
  const tenant = process.env.MICROSOFT_TENANT || "common";
  if (!/^(common|organizations|consumers|[0-9a-fA-F-]{36})$/.test(tenant))
    throw new ApiError("MICROSOFT_TENANT invalide.", 503);
  let base: string;
  try {
    base = callbackOrigin(
      process.env.APP_URL,
      origin,
      process.env.NODE_ENV === "production",
    );
  } catch {
    throw new ApiError(
      "APP_URL doit correspondre à une origine HTTPS en production.",
      503,
    );
  }
  return {
    clientId,
    secret,
    authorize: google
      ? "https://accounts.google.com/o/oauth2/v2/auth"
      : "https://login.microsoftonline.com/" +
        tenant +
        "/oauth2/v2.0/authorize",
    token: google
      ? "https://oauth2.googleapis.com/token"
      : "https://login.microsoftonline.com/" + tenant + "/oauth2/v2.0/token",
    scope: services[p].scopes.join(" "),
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
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: c.clientId,
        client_secret: c.secret,
        ...fields,
      }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ApiError(
      "Le fournisseur est indisponible. Réessayez la connexion.",
      502,
    );
  }
  if (!response.ok)
    throw new ApiError(
      "L’autorisation du fournisseur a expiré ou a été refusée. Reconnectez le compte.",
      409,
    );
  const parsed = tokenResponse.safeParse(await response.json());
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
export async function connection(
  client: SupabaseClient,
  w: string,
  p: Service,
) {
  let data = await saved(client, w, p);
  let tokens = unseal<Tokens>(data.encrypted_tokens);
  if (!hasRequiredScopes(p, (tokens.scope || "").split(" ")))
    throw new ApiError(
      "Les permissions sont insuffisantes. Reconnectez ce service.",
      409,
    );
  if (tokens.expires_at < Date.now() + 60000) {
    if (!tokens.refresh_token)
      throw new ApiError(
        "Reconnectez ce service pour renouveler son autorisation.",
        409,
      );
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
      if (!hasRequiredScopes(p, tokens.scope.split(" ")))
        throw new ApiError(
          "Les permissions ont changé. Reconnectez ce service.",
          409,
        );
      const finish = await client.rpc("integration_refresh_finish", {
        w,
        p,
        expected_revision: data.revision,
        encrypted: seal(tokens),
        permissions: tokens.scope.split(" "),
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
    permissions: tokens.scope.split(" "),
    oauth_hash: oauthHash,
  });
  databaseError(error);
}
export async function externalJson(
  url: string,
  token: string,
  init: RequestInit = {},
): Promise<Record<string, any>> {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    ![
      "gmail.googleapis.com",
      "www.googleapis.com",
      "openidconnect.googleapis.com",
      "graph.microsoft.com",
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
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ApiError(
      "Le fournisseur est indisponible. Réessayez plus tard.",
      502,
    );
  }
  if (!response.ok) {
    // Only known error codes influence the message; never expose provider payloads or tokens.
    const payload: unknown = await response.json().catch(() => null);
    const apiName =
      parsed.hostname === "gmail.googleapis.com"
        ? "Gmail"
        : parsed.hostname === "www.googleapis.com" &&
            parsed.pathname.startsWith("/calendar/")
          ? "Google Calendar"
          : parsed.hostname === "graph.microsoft.com"
            ? "Microsoft Graph"
            : "Google";
    const failure = providerFailure(response.status, payload, apiName);
    throw new ApiError(failure.message, failure.status);
  }
  if (response.status === 202 || response.status === 204) return {};
  return response.json();
}
