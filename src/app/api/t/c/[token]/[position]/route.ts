import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/supabase/admin";
import { automatedAgent } from "@/lib/domain/email-tracking";

type Params = { params: Promise<{ token: string; position: string }> };

/**
 * Click redirect of a tracked sequence email. The destination is the URL stored
 * when the email was sent: a forged token or position never redirects elsewhere.
 */
async function redirect(request: NextRequest, { params }: Params, count: boolean) {
  const values = await params;
  const token = z.uuid().safeParse(values.token);
  const position = z.coerce.number().int().min(1).max(20).safeParse(values.position);
  if (!token.success || !position.success)
    return new NextResponse("Lien invalide", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  const { data, error } = await adminDb().rpc("email_tracking_hit", {
    tracking: token.data,
    kind: "click",
    link_position: position.data,
    count_it: count && !automatedAgent(request.headers.get("user-agent")),
  });
  const url = !error && data && typeof data.url === "string" ? data.url : null;
  if (!url || !/^https?:\/\//.test(url))
    return new NextResponse("Lien expiré ou invalide", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

export function GET(request: NextRequest, context: Params) {
  return redirect(request, context, true);
}
// Link checkers often send HEAD first: answer it without counting a click.
export function HEAD(request: NextRequest, context: Params) {
  return redirect(request, context, false);
}
