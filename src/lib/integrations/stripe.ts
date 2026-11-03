import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PlanId = "pro" | "business";
export const planIds: PlanId[] = ["pro", "business"];

export function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;
}
/** Price IDs come from the environment: STRIPE_PRICE_PRO, STRIPE_PRICE_BUSINESS. */
export function priceForPlan(plan: PlanId) {
  const value = process.env[plan === "pro" ? "STRIPE_PRICE_PRO" : "STRIPE_PRICE_BUSINESS"];
  return value && /^price_[A-Za-z0-9]+$/.test(value) ? value : null;
}
export function planForPrice(price: string | undefined): PlanId | null {
  return planIds.find((plan) => price && priceForPlan(plan) === price) ?? null;
}

/** Stripe's bracket notation for nested form parameters. */
export function formEncode(params: Record<string, unknown>, prefix = ""): string[] {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value))
      value.forEach((item, index) =>
        typeof item === "object" && item !== null
          ? pairs.push(...formEncode(item as Record<string, unknown>, `${name}[${index}]`))
          : pairs.push(
              `${encodeURIComponent(`${name}[${index}]`)}=${encodeURIComponent(String(item))}`,
            ),
      );
    else if (typeof value === "object")
      pairs.push(...formEncode(value as Record<string, unknown>, name));
    else pairs.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
  }
  return pairs;
}

export class StripeError extends Error {
  constructor(
    public status: number,
    public code?: string,
  ) {
    super("stripe_request_failed");
  }
}
export async function stripe<T = Record<string, unknown>>(
  method: "GET" | "POST",
  path: string,
  params: Record<string, unknown> = {},
  idempotencyKey?: string,
): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeError(503, "not_configured");
  const body = formEncode(params).join("&");
  const url = "https://api.stripe.com/v1" + path + (method === "GET" && body ? "?" + body : "");
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: "Bearer " + key,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: method === "POST" ? body : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = data.error as { code?: string; type?: string } | undefined;
    throw new StripeError(response.status, error?.code ?? error?.type);
  }
  return data as T;
}

/** Verifies `Stripe-Signature` (t=…,v1=…) over the raw body; 5-minute tolerance. */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  now = Math.floor(Date.now() / 1000),
) {
  if (!header) return false;
  const items = header.split(",").map((part) => part.trim().split("=", 2) as [string, string]);
  const timestamp = Number(items.find(([k]) => k === "t")?.[1]);
  if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest();
  return items
    .filter(([k]) => k === "v1")
    .some(([, value]) => {
      const candidate = Buffer.from(value ?? "", "hex");
      return candidate.length === expected.length && timingSafeEqual(candidate, expected);
    });
}

type StripeSubscription = {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  trial_end?: number | null;
  metadata?: Record<string, string>;
  items?: {
    data?: { id: string; quantity?: number; current_period_end?: number; price?: { id: string } }[];
  };
};
const timestamp = (value?: number | null) => (value ? new Date(value * 1000).toISOString() : null);
/** Normalized state; recent API versions moved the period end onto subscription items. */
export function subscriptionState(subscription: StripeSubscription) {
  const item = subscription.items?.data?.[0];
  return {
    customer: subscription.customer,
    subscription: subscription.id,
    plan: planForPrice(item?.price?.id) ?? "pro",
    known_price: !!planForPrice(item?.price?.id),
    status: subscription.status,
    seats: item?.quantity ?? 1,
    period_end: timestamp(subscription.current_period_end ?? item?.current_period_end),
    cancel_at_end: !!subscription.cancel_at_period_end,
    trial: timestamp(subscription.trial_end),
    item: item?.id,
  };
}

async function workspaceFor(subscription: StripeSubscription) {
  if (subscription.metadata?.workspace_id) return subscription.metadata.workspace_id;
  const customer = await stripe<{ metadata?: Record<string, string> }>(
    "GET",
    "/customers/" + subscription.customer,
  );
  return customer.metadata?.workspace_id ?? null;
}

/** Applies one verified webhook event. Returns the database outcome. */
export async function handleStripeEvent(
  admin: SupabaseClient,
  event: { id: string; type: string; created: number; data: { object: Record<string, unknown> } },
) {
  let subscription: StripeSubscription | null = null;
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as { mode?: string; subscription?: string };
    if (session.mode !== "subscription" || !session.subscription) return "ignored";
    subscription = await stripe<StripeSubscription>(
      "GET",
      "/subscriptions/" + session.subscription,
    );
  } else if (event.type.startsWith("customer.subscription.")) {
    subscription = event.data.object as unknown as StripeSubscription;
  } else return "ignored";
  const workspace = await workspaceFor(subscription);
  if (!workspace || !/^[0-9a-f-]{36}$/i.test(workspace)) return "unknown_workspace";
  const state = subscriptionState(subscription);
  const { data, error } = await admin.rpc("billing_apply", {
    event_id: event.id,
    event_type: event.type,
    event_at: new Date(event.created * 1000).toISOString(),
    w: workspace,
    customer: state.customer,
    subscription: state.subscription,
    plan_name: state.plan,
    state: state.status,
    seat_count: state.seats,
    period_end: state.period_end,
    cancel_at_end: state.cancel_at_end,
    trial: state.trial,
  });
  if (error) throw Object.assign(new Error("billing_apply"), { code: error.code });
  return String(data);
}

/** Worker: aligns subscription quantities with billable members (owners, admins, members). */
export async function syncSeats(admin: SupabaseClient) {
  if (!process.env.STRIPE_SECRET_KEY) return { updated: 0 };
  const { data, error } = await admin.rpc("billing_seat_drift", { batch: 50 });
  if (error) throw Object.assign(new Error("billing_seat_drift"), { code: error.code });
  let updated = 0;
  for (const row of (Array.isArray(data) ? data : []) as {
    subscription: string;
    billable: number;
  }[]) {
    const current = subscriptionState(
      await stripe<StripeSubscription>("GET", "/subscriptions/" + row.subscription),
    );
    if (!current.item || current.seats === row.billable) continue;
    await stripe(
      "POST",
      "/subscriptions/" + row.subscription,
      {
        items: [{ id: current.item, quantity: row.billable }],
        proration_behavior: "create_prorations",
      },
      `seats:${row.subscription}:${row.billable}:${new Date().toISOString().slice(0, 13)}`,
    );
    updated++;
  }
  return { updated };
}
