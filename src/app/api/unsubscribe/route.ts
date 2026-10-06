import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { digest } from "@/lib/integrations/crypto";
import { checkOrigin, fail, databaseError } from "@/lib/api/context";
import { z } from "zod";
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const { id, token } = z
      .object({ id: z.uuid(), token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
      .parse(await req.json());
    const { data, error } = await adminDb().rpc("sequence_unsubscribe", {
      enrollment: id,
      token_hash: digest(token),
    });
    databaseError(error);
    return NextResponse.json(
      data ? { ok: true } : { error: "Ce lien est invalide." },
      { status: data ? 200 : 400 },
    );
  } catch (e) {
    return fail(e);
  }
}
