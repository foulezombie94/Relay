import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
export function workerClient(
  admin: SupabaseClient,
  workspace: string,
  user: string,
  provider: string,
): SupabaseClient {
  return {
    rpc: async (operation: string, payload: Record<string, unknown>) => {
      if (
        ![
          "integration_get",
          "integration_refresh_claim",
          "integration_refresh_finish",
          "connector_sync",
          "meeting_sync_finish",
        ].includes(operation)
      )
        throw new Error("Opération worker invalide");
      return admin.rpc("integration_worker", {
        w: workspace,
        p: provider,
        subject: user,
        operation,
        payload,
      });
    },
  } as unknown as SupabaseClient;
}
