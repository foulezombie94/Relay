import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sessionCookieOptions } from "./session";
import { getSupabaseConfig } from "./config";
import { supabaseFetch } from "./fetch";
export async function db() {
  const config = getSupabaseConfig();
  const jar = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: sessionCookieOptions(),
    global: { fetch: supabaseFetch },
    cookies: {
      getAll: () => jar.getAll(),
      setAll(items) {
        try {
          items.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          /* Read-only server rendering; proxy persists refresh cookies. */
        }
      },
    },
  });
}
