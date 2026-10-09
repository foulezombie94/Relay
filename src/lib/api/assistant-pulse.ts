import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ApiError, databaseError } from "./context";
import type { AssistantPulse } from "@/lib/domain/assistant-pulse";
const count = z.number().int().nonnegative();
const pulse = z.object({
  counts: z.object({
    attention: count,
    opportunities: count,
    open_tasks: count,
    overdue_tasks: count,
    due_commitments: count,
    open_conflicts: count,
  }),
  signals: z
    .array(
      z.object({
        kind: z.enum(["email", "deal", "commitment"]),
        detected: z.boolean(),
        source_id: z.uuid().optional(),
        record_id: z.uuid().optional(),
        label: z.string().max(160).optional(),
      }),
    )
    .length(3),
  generated_at: z.string(),
  email_candidates_scanned: count.max(3),
});
export async function readAssistantPulse(
  client: SupabaseClient,
  workspace: string,
  _user: string,
  signal: AbortSignal,
  now = new Date(),
): Promise<AssistantPulse> {
  // SQL binds the account to auth.uid(); a caller-supplied user cannot widen it.
  const r = await client
    .rpc("crm_pulse", { w: workspace, at_time: now.toISOString() })
    .abortSignal(signal);
  databaseError(r.error);
  const parsed = pulse.safeParse(r.data);
  if (!parsed.success) throw new ApiError("Le compteur Pulse n’est pas disponible.", 503);
  return parsed.data;
}
