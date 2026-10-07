import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/supabase/admin";
import { workflowBody } from "@/lib/api/workflow-body";
import { unseal } from "@/lib/integrations/crypto";
import { ApiError, databaseError, fail } from "@/lib/api/context";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id),
      raw = await workflowBody(req);
    const timestamp = req.headers.get("x-relay-timestamp") ?? "",
      event = z.uuid().parse(req.headers.get("x-relay-event-id"));
    const signature = req.headers.get("x-relay-signature") ?? "";
    if (
      !/^\d{10}$/.test(timestamp) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
      !/^[a-f0-9]{64}$/i.test(signature)
    )
      throw new ApiError("Signature invalide.", 401);
    const admin = adminDb();
    const { data: hook, error } = await admin.rpc("workflow_hook_get", { wf: id });
    databaseError(error);
    if (!hook) throw new ApiError("Webhook indisponible.", 404);
    const { secret } = unseal<{ secret: string }>(hook.encrypted_secret);
    const expected = createHmac("sha256", secret).update(`${timestamp}.${event}.${raw}`).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
      throw new ApiError("Signature invalide.", 401);
    const input = z
      .object({ record_id: z.uuid(), data: z.record(z.string(), z.unknown()) })
      .strict()
      .parse(JSON.parse(raw));
    const { data, error: err } = await admin.rpc("workflow_ingest", {
      wf: id,
      rec: input.record_id,
      kind: hook.kind,
      event_key: event,
      event_data: input.data,
    });
    databaseError(err);
    return NextResponse.json({ data }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return fail(error);
  }
}
