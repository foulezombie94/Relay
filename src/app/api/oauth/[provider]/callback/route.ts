import { NextRequest, NextResponse } from "next/server";
import { context, ApiError, databaseError } from "@/lib/api/context";
import {
  provider,
  unseal,
  exchange,
  storeTokens,
  externalJson,
  digest,
} from "@/lib/integrations/oauth";
import { services, hasRequiredScopes } from "@/lib/integrations/services";
import { credentialClient } from "@/lib/integrations/credential-client";
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const raw = (await params).provider;
  let message = "Connexion impossible. Recommencez depuis les intégrations.";
  let connected = false;
  try {
    const p = provider(raw);
    const cookie = req.cookies.get("relay-oauth-" + p)?.value;
    if (!cookie) throw new ApiError("Autorisation expirée. Recommencez.");
    const s = unseal<{
      workspace: string;
      user: string;
      state: string;
      verifier: string;
      redirect: string;
      expires: number;
    }>(cookie);
    if (s.expires < Date.now() || s.state !== req.nextUrl.searchParams.get("state"))
      throw new ApiError("Autorisation invalide ou expirée.");
    const { client, user } = await context(s.workspace, true);
    if (user.id !== s.user) throw new ApiError("La session a changé.");
    const credentials = await credentialClient(client);
    const { data: consumed, error } = await credentials.rpc("integration_oauth_consume", {
      w: s.workspace,
      p,
      state_hash: digest(s.state),
    });
    databaseError(error);
    if (!consumed) throw new ApiError("Cette autorisation a déjà été utilisée ou a expiré.");
    if (req.nextUrl.searchParams.get("error"))
      throw new ApiError("Connexion annulée ou refusée par le fournisseur.");
    const code = req.nextUrl.searchParams.get("code");
    if (!code) throw new ApiError("Code OAuth manquant.");
    const fresh = await exchange(p, {
      grant_type: "authorization_code",
      code,
      code_verifier: s.verifier,
      redirect_uri: s.redirect,
    });
    if (!hasRequiredScopes(p, (fresh.scope || "").split(" ")))
      throw new ApiError(
        "Toutes les permissions nécessaires n’ont pas été accordées. Reconnectez le service.",
      );
    const profile = await externalJson(
      p === "zoom"
        ? "https://api.zoom.us/v2/users/me"
        : services[p].family === "google"
          ? "https://openidconnect.googleapis.com/v1/userinfo"
          : "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName",
      fresh.access_token,
    );
    const email =
      p === "zoom"
        ? profile.email
        : services[p].family === "google"
          ? profile.email
          : profile.mail || profile.userPrincipalName;
    if (
      typeof email !== "string" ||
      !email ||
      email.length > 320 ||
      (services[p].family === "google" && profile.email_verified !== true)
    )
      throw new ApiError("Adresse du compte non vérifiée ou introuvable.");
    await storeTokens(
      client,
      s.workspace,
      p,
      {
        ...fresh,
        email,
        scope: fresh.scope!,
        expires_at: Date.now() + fresh.expires_in * 1000,
      },
      digest(s.state),
    );
    connected = true;
    message = services[p].name + " connecté.";
  } catch (e) {
    message =
      e instanceof ApiError
        ? e.message
        : "Autorisation invalide. Recommencez depuis les intégrations.";
  }
  const destination = new URL("/app/integrations", req.url);
  destination.searchParams.set(connected ? "connected" : "connection_error", message);
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  if (
    /^(gmail|google-calendar|outlook|outlook-calendar|google|microsoft|google-meet|microsoft-teams|zoom)$/.test(
      raw,
    )
  )
    response.cookies.set("relay-oauth-" + provider(raw), "", {
      path: "/api/oauth/" + provider(raw) + "/callback",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
    });
  return response;
}
