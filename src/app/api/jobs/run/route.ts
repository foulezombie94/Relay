import { NextRequest, NextResponse } from "next/server";
import { processSequence } from "@/lib/integrations/sequence-worker";
import { timingSafeEqual } from "node:crypto";
import { adminDb } from "@/lib/supabase/admin";
import { synchronize } from "@/lib/integrations/sync";
import { workerClient } from "@/lib/integrations/worker-client";
import { provider } from "@/lib/integrations/oauth";
import { databaseError, fail } from "@/lib/api/context";
export const maxDuration = 120;
export async function POST(req: NextRequest) {
  const expected = process.env.JOBS_SECRET;
  const provided =
    req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (
    !expected ||
    Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  )
    return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  try {
    const admin = adminDb();
    const { data, error } = await admin.rpc("connector_jobs");
    databaseError(error);
    let completed = 0,
      failed = 0;
    const started = Date.now();
    for (const job of data ?? []) {
      if (Date.now() - started > 80000) break;
      try {
        await synchronize(
          workerClient(admin, job.workspace_id, job.user_id, job.provider),
          job.workspace_id,
          job.user_id,
          provider(job.provider),
        );
        completed++;
      } catch {
        failed++;
      }
    }
    let followed = 0;
    for (let n = 0; n < 3 && Date.now() - started < 90000; n++) {
      if (!(await processSequence(admin))) break;
      followed++;
    }
    return NextResponse.json(
      { completed, failed, followed },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
