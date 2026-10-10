import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { context } from "@/lib/api/context";
import { families } from "@/lib/integrations/platform/contracts";
import { integrationServices } from "@/lib/integrations/platform/api";
import { providerFor } from "@/lib/integrations/platform/registry";
import { consumeOAuth, returnURL, stateHash } from "@/lib/integrations/platform/oauth-state";
import { userActor } from "@/lib/integrations/platform/runtime";
import { decrypt, encrypt } from "@/lib/integrations/platform/vault";
import { credentialSchema } from "@/lib/integrations/platform/contracts";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string; workspace: string }> },
) {
  const { provider: family, workspace } = await params;
  let cookieName = "",
    path = "/app/integrations",
    connected = false;
  try {
    const provider = providerFor(z.enum(families).parse(family)),
      { user } = await context(workspace, true),
      actor = userActor(workspace, user.id),
      { store } = integrationServices();
    const state = request.nextUrl.searchParams.get("state") ?? "";
    cookieName = "zyliad-integration-oauth-" + stateHash(state).slice(0, 16);
    const consumed = await consumeOAuth(
      store,
      actor,
      provider,
      state,
      request.cookies.get(cookieName)?.value,
    );
    path = consumed.path;
    if (request.nextUrl.searchParams.has("error")) throw new Error("authorization_denied");
    const code = z.string().min(1).max(4096).parse(request.nextUrl.searchParams.get("code"));
    const grant = await provider.exchangeCode(code, consumed.redirectUri, consumed.verifier);
    const account = await provider.identify(grant.credentials);
    const binding = {
      workspaceId: workspace,
      connectionId: consumed.connection_id,
      provider: provider.provider,
      externalAccountId: account.id,
      purpose: "credentials" as const,
    };
    let previous: z.infer<typeof credentialSchema> = {};
    try {
      const old = z
        .object({
          connection: z.object({ external_account_id: z.string() }),
          encrypted_credentials: z.string(),
        })
        .parse(await store.call(actor, "load", { connection_id: consumed.connection_id }));
      if (old.connection.external_account_id === account.id)
        previous = credentialSchema.parse(decrypt(old.encrypted_credentials, binding));
    } catch {
      /* A first connection or a revoked grant has no usable old credentials. */
    }
    const credentials = credentialSchema.parse({
      ...grant.credentials,
      refreshToken: grant.credentials.refreshToken ?? previous.refreshToken,
      signingSecret: previous.signingSecret ?? randomBytes(32).toString("base64url"),
    });
    if (!credentials.refreshToken) throw new Error("offline_access_not_granted");
    if (
      !consumed.requested_scopes
        .filter((scope) => !["openid", "email", "offline_access"].includes(scope))
        .every((scope) => grant.scopes.includes(scope))
    )
      throw new Error("scopes_not_granted");
    await store.call(actor, "save_grant", {
      connection_id: consumed.connection_id,
      hashed_state: consumed.hashedState,
      external_account_id: account.id,
      external_account_name: account.name,
      email: account.email,
      encrypted_credentials: encrypt(credentials, binding),
      scopes: grant.scopes,
      expires_at: credentials.expiresAt ? new Date(credentials.expiresAt).toISOString() : null,
    });
    connected = true;
  } catch {
    /* Errors and codes from the provider never enter redirects, logs or UI. */
  }
  const destination = returnURL(path);
  destination.searchParams.set(
    connected ? "integration_connected" : "integration_error",
    connected ? family : "connection_failed",
  );
  const response = NextResponse.redirect(destination, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  if (cookieName)
    response.cookies.set(cookieName, "", {
      httpOnly: true,
      path: `/api/integration-oauth/${family}/${workspace}/callback`,
      maxAge: 0,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  return response;
}
