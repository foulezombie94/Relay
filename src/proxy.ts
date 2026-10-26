import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { loginDestination, sessionCookieOptions } from "@/lib/supabase/session";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { contentSecurityPolicy } from "@/lib/security/content-security-policy";
import { supabaseFetch } from "@/lib/supabase/fetch";
export async function proxy(request: NextRequest) {
  const database = getSupabaseConfig();
  const policy = contentSecurityPolicy({
    nonce: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64"),
    databaseUrl: database.url,
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    development: process.env.NODE_ENV === "development",
  });
  // Replace any client-supplied CSP before Next extracts the script nonce.
  request.headers.set("Content-Security-Policy", policy);
  const next = () => {
    const result = NextResponse.next({ request: { headers: request.headers } });
    result.headers.set("Content-Security-Policy", policy);
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  };
  let response = next();
  if (
    request.nextUrl.pathname === "/api/health" ||
    request.nextUrl.pathname === "/api/jobs/run" ||
    request.nextUrl.pathname === "/api/mcp" ||
    request.nextUrl.pathname.startsWith("/forms/") ||
    request.nextUrl.pathname.startsWith("/api/forms/") ||
    /^\/mcp\/zyliad-mcp-1\.(?:0\.0|1\.[01])\.tgz$/.test(request.nextUrl.pathname) ||
    (request.nextUrl.pathname.startsWith("/api/mcp/oauth/") &&
      !request.nextUrl.pathname.endsWith("/consent")) ||
    request.nextUrl.pathname.startsWith("/.well-known/")
  )
    return response;
  const isHome = request.nextUrl.pathname === "/";
  // The home route varies by session. Even its anonymous response must not be
  // cached, or reopening the site could reuse the landing page after sign-in.
  if (isHome) response.headers.set("Cache-Control", "private, no-store");
  if (isHome) {
    const cookieName = `sb-${new URL(database.url).hostname.split(".")[0]}-auth-token`;
    const hasSessionCookie = request.cookies
      .getAll()
      .some(
        ({ name, value }) =>
          value &&
          (name === cookieName ||
            (name.startsWith(cookieName + ".") && /^\d+$/.test(name.slice(cookieName.length + 1)))),
      );
    // A cookie is only a hint to attempt verification, never authorization.
    if (!hasSessionCookie) return response;
  }
  const client = createServerClient(database.url, database.key, {
    cookieOptions: sessionCookieOptions(),
    global: { fetch: supabaseFetch },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(items, headers) {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        const previous = response;
        response = next();
        previous.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        for (const key of ["Cache-Control", "Expires", "Pragma"]) {
          const value = previous.headers.get(key);
          if (value) response.headers.set(key, value);
        }
        if (headers)
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });
  const mode = request.nextUrl.searchParams.get("mode");
  if (isHome || (request.nextUrl.pathname === "/login" && mode !== "signup" && mode !== "reset")) {
    // A cookie or locally valid JWT alone is not enough to restore a session.
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (user && !error) {
      const destination = isHome
        ? "/app/dashboard"
        : loginDestination(request.nextUrl.searchParams.get("next"));
      const redirect = NextResponse.redirect(new URL(destination, request.url));
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      for (const key of ["Cache-Control", "Expires", "Pragma"]) {
        const value = response.headers.get(key);
        if (value) redirect.headers.set(key, value);
      }
      redirect.headers.set("Content-Security-Policy", policy);
      response = redirect;
    }
  } else await client.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
