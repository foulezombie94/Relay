import "server-only";
import { secondFactorPending } from "@/lib/supabase/mfa";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/context";
import { assertAuthAvailable } from "@/lib/supabase/session";
import { adminDb } from "@/lib/supabase/admin";

const operations = new Set([
  "integration_get",
  "integration_oauth_begin",
  "integration_oauth_consume",
  "integration_save",
  "integration_refresh_claim",
  "integration_refresh_finish",
]);

/** Credentials cross a service-only RPC after verifying the user's Auth session.
 * The existing server-created worker shim already uses integration_worker and
 * deliberately has no Auth client. It retains its membership/lease checks.
 */
export async function credentialClient(client: SupabaseClient): Promise<SupabaseClient> {
  if (!client.auth) return client;
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  assertAuthAvailable(error);
  if (error || !user) throw new ApiError("Connexion requise.", 401);
  if (await secondFactorPending(client, user))
    throw new ApiError("Confirmez votre code de double authentification.", 401, "mfa_required");
  return {
    rpc: (operation: string, args: Record<string, unknown>) => {
      if (!operations.has(operation)) throw new Error("Opération de credentials invalide.");
      const { w, p, ...payload } = args;
      return adminDb().rpc("integration_server", {
        w,
        p,
        subject: user.id,
        operation,
        payload,
      });
    },
  } as unknown as SupabaseClient;
}
