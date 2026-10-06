import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import {
  context,
  checkOrigin,
  databaseError,
  fail,
  ApiError,
} from "@/lib/api/context";
import { digest, seal } from "@/lib/integrations/crypto";
import {
  sequenceSteps,
  sequenceMessage,
  nextSequenceDate,
} from "@/lib/domain/sequences";
import { z } from "zod";
import { workerReady } from "@/lib/jobs/client";
import { backgroundJobsEnabled } from "@/lib/jobs/flags";
import { adminDb } from "@/lib/supabase/admin";
type P = { params: Promise<{ workspace: string }> };
export async function POST(req: NextRequest, { params }: P) {
  try {
    checkOrigin(req);
    const { workspace } = await params;
    const { client } = await context(workspace, true);
    const body = z
      .object({
        sequence_id: z.uuid(),
        record_id: z.uuid(),
        provider: z.enum(["gmail", "outlook"]),
        confirmed: z.literal(true),
        sequence_version: z.number().int(),
        record_version: z.number().int(),
      })
      .parse(await req.json());
    if (
      !backgroundJobsEnabled() || process.env.FEATURE_SEQUENCE_SEND!=="true" ||
      !process.env.APP_URL?.startsWith("https://")
    )
      throw new ApiError(
        "Les envois planifiés nécessitent un domaine HTTPS public et le service de suivi actif. Votre administrateur doit terminer cette configuration.",
        503,
      );
    if(!(await workerReady(adminDb(),"sequence_send"))) throw new ApiError("Le service d’envoi est temporairement indisponible.",503);
    const [{ data: s, error: se }, { data: r, error: re }] = await Promise.all([
      client
        .from("sequences")
        .select("*")
        .eq("workspace_id", workspace)
        .eq("id", body.sequence_id)
        .single(),
      client
        .from("records")
        .select("*")
        .eq("workspace_id", workspace)
        .eq("id", body.record_id)
        .single(),
    ]);
    databaseError(se);
    databaseError(re);
    if (!s || !r || !s.enabled || r.archived)
      throw new ApiError("La séquence ou la fiche est indisponible.");
    const email = z.email().parse(r.email);
    const steps = sequenceSteps.parse(s.steps);
    steps.forEach((step) => sequenceMessage(step, r));
    const token = randomBytes(32).toString("base64url");
    const { data, error } = await client.rpc("sequence_enroll", {
      w: workspace,
      seq: s.id,
      rec: r.id,
      seq_version: body.sequence_version,
      record_version: body.record_version,
      p: body.provider,
      unsubscribe_hash: digest(token),
      unsubscribe_cipher: seal({ token }),
      next_at: nextSequenceDate(steps[0].delay_days, s.timezone).toISOString(),
    });
    databaseError(error);
    return NextResponse.json({ data: { id: data, email } });
  } catch (e) {
    return fail(e);
  }
}
export async function PATCH(req: NextRequest, { params }: P) {
  try {
    checkOrigin(req);
    const { workspace } = await params;
    const { client } = await context(workspace, true);
    const { id, command } = z
      .object({ id: z.uuid(), command: z.enum(["pause", "resume", "stop"]) })
      .parse(await req.json());
    const { error } = await client.rpc("sequence_control", {
      w: workspace,
      enrollment: id,
      command,
    });
    databaseError(error);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
