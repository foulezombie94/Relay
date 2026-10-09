import type { AuthError, SupabaseClient } from "@supabase/supabase-js";

// Keep the SDK's persistent cookie lifetime. Token validity and revocation are
// enforced by Supabase, independently of how long the browser keeps a cookie.
export function sessionCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    priority: "high" as const,
  };
}

export class AuthUnavailableError extends Error {
  constructor() {
    super("La vérification de votre session est temporairement indisponible. Réessayez.");
    this.name = "AuthUnavailableError";
  }
}

export function assertAuthAvailable(error: AuthError | null) {
  if (
    error &&
    (error.name === "AuthRetryableFetchError" ||
      error.status === 0 ||
      error.status === 429 ||
      (error.status !== undefined && error.status >= 500))
  ) {
    throw new AuthUnavailableError();
  }
}

// Only fixed local destinations can be restored after authentication.
export function loginDestination(next: string | null) {
  return next === "/invite" ? "/invite" : "/app/dashboard";
}

export function observeSession(
  auth: Pick<SupabaseClient["auth"], "onAuthStateChange">,
  userId: string,
  clear: () => void,
  signOut: () => void,
  switchAccount: () => void,
) {
  let leaving = false;
  const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
    // Do not call auth methods from this callback: it executes under the SDK's
    // session lock. INITIAL_SESSION=null can also mean a temporary network error.
    if (leaving) return;
    if (event === "SIGNED_OUT") {
      leaving = true;
      clear();
      signOut();
    } else if (session && session.user.id !== userId) {
      leaving = true;
      clear();
      switchAccount();
    }
  });
  return () => subscription.unsubscribe();
}
