import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { synchronize } from "@/lib/integrations/sync";
import { workerClient } from "@/lib/integrations/worker-client";
import { provider } from "@/lib/integrations/oauth";
import { services } from "@/lib/integrations/services";
import { ApiError } from "@/lib/api/context";
import { PermanentJobError, type Job, type JobResult } from "../types";
export async function syncJob(admin: SupabaseClient, job: Job): Promise<JobResult> {
  if (!job.user_id) throw new PermanentJobError("missing_subject");
  const service = provider(String(job.payload.provider));
  if ((job.type === "email_sync") !== (services[service].kind === "email"))
    throw new PermanentJobError("invalid_provider");
  try {
    const result = await synchronize(
      workerClient(admin, job.workspace_id, job.user_id, service),
      job.workspace_id,
      job.user_id,
      service,
    );
    return { result: { synced: result.synced, complete: result.complete } };
  } catch (e) {
    if (e instanceof ApiError && [401, 403].includes(e.status))
      throw new PermanentJobError("provider_access_denied");
    throw e;
  }
}
