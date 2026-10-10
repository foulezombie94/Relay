import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";
import { supabaseFetch } from "./fetch";
export function adminDb() {
  if (!process.env.SUPABASE_SECRET_KEY) throw new Error("Server credentials are missing");
  const config = getSupabaseConfig(false);
  return createClient(config.url, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: supabaseFetch },
  });
}
