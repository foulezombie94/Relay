import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { adminDb } from "@/lib/supabase/admin";
import { handleStripeEvent, verifyStripeSignature } from "@/lib/integrations/stripe";
import { logEvent } from "@/lib/observability/logger";

/**
 * Stripe webhook. The raw body is verified before parsing; each event id is
 * applied once. A 5xx makes Stripe retry, so only transient failures return one.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const payload = await request.text();
  if (payload.length > 1_000_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  if (!verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret))
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  let event: {
    id: string;
    type: string;
    created: number;
    data: { object: Record<string, unknown> };
  };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (!/^evt_[A-Za-z0-9]+$/.test(event.id ?? "") || typeof event.type !== "string")
    return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  try {
    const outcome = await handleStripeEvent(adminDb(), event);
    return NextResponse.json({ received: true, outcome });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code).slice(0, 40)
        : undefined;
    Sentry.captureException(new Error("stripe_webhook_failure"), { tags: code ? { code } : {} });
    await logEvent("error", "stripe_webhook_failure", { code, action: event.type });
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }
}
