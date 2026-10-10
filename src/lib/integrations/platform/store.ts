import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { databaseError } from "@/lib/api/context";
import type { Actor } from "./contracts";
export class IntegrationStore {
  constructor(private readonly admin: SupabaseClient) {}
  async call(
    actor: Actor,
    operation: string,
    payload: Record<string, unknown> = {},
  ): Promise<unknown> {
    const { data, error } = await this.admin.rpc("integration_runtime", {
      w: actor.workspaceId,
      subject: actor.userId,
      operation,
      payload,
    });
    databaseError(error);
    return data;
  }
}
export async function manageIntegrations(
  client: SupabaseClient,
  workspaceId: string,
  operation: string,
  payload: Record<string, unknown> = {},
): Promise<unknown> {
  const { data, error } = await client.rpc("integration_management", {
    w: workspaceId,
    operation,
    payload,
  });
  databaseError(error);
  return data;
}
