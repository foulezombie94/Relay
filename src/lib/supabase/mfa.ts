import type { SupabaseClient, User } from "@supabase/supabase-js";

/** Reads a claim from a JWT payload without verifying it (the caller already validated the token). */
export function tokenClaim(token: string | undefined, claim: string): unknown {
  const payload = token?.split(".")[1];
  if (!payload) return undefined;
  try {
    const json = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(payload.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
          c.charCodeAt(0),
        ),
      ),
    );
    return json && typeof json === "object" ? (json as Record<string, unknown>)[claim] : undefined;
  } catch {
    return undefined;
  }
}

export function hasVerifiedFactor(user: Pick<User, "factors"> | null | undefined) {
  return (user?.factors ?? []).some((factor) => factor.status === "verified");
}

/**
 * True when the account has a verified second factor but the current session
 * was not upgraded to aal2. Call after `auth.getUser()` validated the session:
 * the access token decoded here is the one the Auth server just accepted.
 */
export async function secondFactorPending(client: SupabaseClient, user: User) {
  if (!hasVerifiedFactor(user)) return false;
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session || session.user?.id !== user.id) return true;
  return tokenClaim(session.access_token, "aal") !== "aal2";
}
