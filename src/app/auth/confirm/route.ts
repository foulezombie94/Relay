import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { db } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const client = await db();
  const code = p.get("code");
  let error;
  if (code) ({ error } = await client.auth.exchangeCodeForSession(code));
  else if (p.get("token_hash"))
    ({ error } = await client.auth.verifyOtp({
      type: (p.get("type") ?? "email") as EmailOtpType,
      token_hash: p.get("token_hash")!,
    }));
  else error = { message: "Missing token" };
  const next =
    p.get("next") === "/reset-password"
      ? "/reset-password"
      : p.get("next") === "/invite"
        ? "/invite"
        : "/app/dashboard";
  return NextResponse.redirect(
    new URL(
      error ? "/login?error=expired" + (next === "/invite" ? "&next=/invite" : "") : next,
      request.url,
    ),
  );
}
