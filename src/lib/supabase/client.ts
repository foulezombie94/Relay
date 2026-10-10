import { createBrowserClient } from "@supabase/ssr";
import { sessionCookieOptions } from "./session";
import { getSupabaseConfig } from "./config";
import { supabaseFetch } from "./fetch";
export function browserDb() {
  const config = getSupabaseConfig();
  return createBrowserClient(config.url, config.key, {
    cookieOptions: sessionCookieOptions(),
    auth: { persistSession: true, autoRefreshToken: typeof window !== "undefined" },
    global: { fetch: supabaseFetch },
  });
}
