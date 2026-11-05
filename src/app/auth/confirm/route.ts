import { NextRequest, NextResponse } from "next/server";
import { emailLink } from "@/lib/supabase/email-link";
import { boundedFormData } from "@/lib/api/bounded-form";
import { db } from "@/lib/supabase/server";
import { loginDestination } from "@/lib/supabase/session";
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const code = p.get("code");
  if (!code) {
    const link = emailLink(p);
    if (!link) return destination(request, "/login?error=expired");
    return destination(
      request,
      "/auth/verify?" +
        new URLSearchParams({ token_hash: link.tokenHash, type: link.type, next: link.next }),
    );
  }
  if (p.getAll("code").length !== 1 || p.has("token_hash"))
    return destination(request, "/login?error=expired");
  const flowId = p.get("sb_flow_id");
  if (
    p.getAll("sb_flow_id").length > 1 ||
    (flowId !== null && !/^[a-zA-Z0-9_-]{1,128}$/.test(flowId))
  )
    return destination(request, "/login?error=expired");
  const client = await db();
  const { error } = await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
  const next =
    p.get("next") === "/reset-password" ? "/reset-password" : loginDestination(p.get("next"));
  return destination(
    request,
    error ? "/login?error=expired" + (next === "/invite" ? "&next=/invite" : "") : next,
  );
}
function destination(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
export async function POST(request: NextRequest) {
  if (
    request.headers.get("origin") !== request.nextUrl.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return new NextResponse("Origine non autorisée.", { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))
    return new NextResponse("Format invalide.", { status: 415 });
  try {
    const link = emailLink(await boundedFormData(request, 4096));
    if (!link) return destination(request, "/login?error=expired");
    const client = await db();
    const { error } = await client.auth.verifyOtp({ type: link.type, token_hash: link.tokenHash });
    return destination(request, error ? "/login?error=expired" : link.next);
  } catch {
    return destination(request, "/login?error=expired");
  }
}
