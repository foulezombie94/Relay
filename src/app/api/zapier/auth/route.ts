import { NextRequest, NextResponse } from "next/server";
import { fail } from "@/lib/api/context";
import { zapierRequest } from "@/lib/integrations/zapier";
export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(await zapierRequest(req, "verify"), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return fail(e);
  }
}
