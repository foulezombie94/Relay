import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Actor, IntegrationId, IntegrationProvider } from "./contracts";
import { sanitizeConnection } from "./contracts";
import { decrypt, encrypt, type VaultBinding } from "./vault";
import { IntegrationStore } from "./store";
import { IntegrationError } from "./errors";
export const stateHash = (value: string) => createHash("sha256").update(value).digest("hex");
const returnPaths = ["/app/integrations", "/app/settings"] as const;
export function appOrigin(
  value = process.env.APP_URL,
  production = process.env.NODE_ENV === "production",
) {
  if (!value) throw new Error("integration_app_url_missing");
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (production && url.protocol !== "https:") ||
    (!production &&
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  )
    throw new Error("integration_app_url_invalid");
  return url.origin;
}
export function returnURL(path: string, origin = appOrigin()) {
  if (!returnPaths.some((allowed) => allowed === path))
    throw new IntegrationError("validation_error");
  return new URL(path, origin);
}
export function callbackURL(provider: IntegrationProvider, workspaceId: string) {
  return new URL(
    `/api/integration-oauth/${provider.provider}/${z.uuid().parse(workspaceId)}/callback`,
    appOrigin(),
  ).toString();
}
export function stateBinding(
  actor: Actor,
  provider: IntegrationProvider,
  hashedState: string,
): VaultBinding {
  return {
    workspaceId: actor.workspaceId,
    connectionId: hashedState,
    provider: provider.provider,
    purpose: "oauth",
  };
}
export async function beginOAuth(
  store: IntegrationStore,
  actor: Actor,
  provider: IntegrationProvider,
  integrations: IntegrationId[],
  scopes: string[],
  path = "/app/integrations",
) {
  returnURL(path);
  const state = randomBytes(32).toString("base64url"),
    verifier = randomBytes(32).toString("base64url"),
    hashedState = stateHash(state);
  const challenge = createHash("sha256").update(verifier).digest("base64url"),
    binding = stateBinding(actor, provider, hashedState);
  const row = z.object({ connection: z.record(z.string(), z.unknown()) }).parse(
    await store.call(actor, "oauth_begin", {
      connection_id: randomUUID(),
      provider: provider.provider,
      hashed_state: hashedState,
      encrypted_verifier: encrypt(
        { verifier, path, redirectUri: callbackURL(provider, actor.workspaceId) },
        binding,
      ),
      integrations,
      scopes,
    }),
  );
  return {
    url: provider
      .connect({ state, challenge, scopes, redirectUri: callbackURL(provider, actor.workspaceId) })
      .toString(),
    cookieName: "zyliad-integration-oauth-" + hashedState.slice(0, 16),
    cookieValue: encrypt({ userId: actor.userId, expiresAt: Date.now() + 600_000 }, binding),
    connection: sanitizeConnection(row.connection),
  };
}
export async function consumeOAuth(
  store: IntegrationStore,
  actor: Actor,
  provider: IntegrationProvider,
  state: string,
  cookie: string | undefined,
) {
  if (!/^[a-zA-Z0-9_-]{43}$/.test(state) || !cookie)
    throw new IntegrationError("unauthorized", 401);
  const hashedState = stateHash(state),
    binding = stateBinding(actor, provider, hashedState);
  const browser = z
    .object({ userId: z.uuid(), expiresAt: z.number() })
    .parse(decrypt(cookie, binding));
  if (browser.userId !== actor.userId || browser.expiresAt <= Date.now())
    throw new IntegrationError("unauthorized", 401);
  const row = z
    .object({
      connection_id: z.uuid(),
      encrypted_verifier: z.string(),
      requested_scopes: z.array(z.string()),
      requested_integrations: z.array(z.string()),
    })
    .parse(
      await store.call(actor, "oauth_consume", {
        hashed_state: hashedState,
        provider: provider.provider,
      }),
    );
  const verifier = z
    .object({ verifier: z.string(), path: z.string(), redirectUri: z.string() })
    .parse(decrypt(row.encrypted_verifier, binding));
  returnURL(verifier.path);
  if (verifier.redirectUri !== callbackURL(provider, actor.workspaceId))
    throw new IntegrationError("unauthorized", 401);
  return { ...row, ...verifier, hashedState };
}
