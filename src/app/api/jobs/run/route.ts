import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { adminDb } from "@/lib/supabase/admin";
import { queueOperation } from "@/lib/jobs/client";
import { enabledJobTypes } from "@/lib/jobs/flags";
import { fail } from "@/lib/api/context";
export const maxDuration = 30;
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
    // Enqueue only: Railway executes jobs outside the HTTP lifecycle.
    await queueOperation(adminDb(),"schedule",{types:enabledJobTypes()});
    return NextResponse.json(
      { scheduled: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
