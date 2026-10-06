import { NextRequest, NextResponse } from "next/server";
import { context, checkOrigin, databaseError, fail } from "@/lib/api/context";
import {
  config,
  provider,
  seal,
  state,
  digest,
} from "@/lib/integrations/oauth";
import { services } from "@/lib/integrations/services";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string; provider: string }> },
) {
  try {
    checkOrigin(req);
    const { workspace, provider: p } = await params;
    const { user, client } = await context(workspace, true);
    const name = provider(p);
    // Next may canonicalize the request URL to localhost; preserve the validated browser origin for OAuth cookies.
    const c = config(name, req.headers.get('origin') || req.nextUrl.origin);
    const s = state();
    const { error } = await client.rpc("integration_oauth_begin", {
      w: workspace,
      p: name,
      state_hash: digest(s.state),
    });
    databaseError(error);
    const query = new URLSearchParams({
      client_id: c.clientId,
      redirect_uri: c.redirect,
      response_type: "code",
      scope: c.scope,
      state: s.state,
      code_challenge: s.challenge,
      code_challenge_method: "S256",
      ...(services[name].family === "google"
        ? { access_type: "offline", prompt: "consent select_account" }
        : { prompt: "select_account", response_mode: "query" }),
    });
    const response = NextResponse.json(
      { url: c.authorize + "?" + query },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(
      "relay-oauth-" + name,
      seal({
        workspace,
        user: user.id,
        state: s.state,
        verifier: s.verifier,
        redirect: c.redirect,
        expires: Date.now() + 600000,
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/oauth/" + name + "/callback",
        maxAge: 600,
      },
    );
    return response;
  } catch (e) {
    return fail(e);
  }
}
