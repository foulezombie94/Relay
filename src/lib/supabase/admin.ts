import "server-only";
import { createClient } from "@supabase/supabase-js";
export function adminDb() {
  if (!process.env.SUPABASE_SECRET_KEY) throw new Error("Server credentials are missing");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.any([
            AbortSignal.timeout(30000),
            ...(init?.signal ? [init.signal] : []),
          ]),
        }),
    },
  });
}
