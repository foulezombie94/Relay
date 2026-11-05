import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiError,
  checkOrigin,
  context,
  databaseError,
  fail,
  jsonBody,
  requireAdmin,
} from "@/lib/api/context";
import { adminDb } from "@/lib/supabase/admin";
import {
  planIds,
  priceForPlan,
  stripe,
  stripeConfigured,
  StripeError,
  type PlanId,
} from "@/lib/integrations/stripe";

type Params = { params: Promise<{ workspace: string }> };
const noStore = { "Cache-Control": "private, no-store" };
type Price = { unit_amount: number | null; currency: string; recurring?: { interval: string } };
const priceCache = new Map<string, { at: number; value: Price | null }>();

async function priceInfo(id: string | null) {
  if (!id) return null;
  const cached = priceCache.get(id);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.value;
  const value = await stripe<Price>("GET", "/prices/" + id).catch(() => null);
  priceCache.set(id, { at: Date.now(), value });
  return value;
}
function origin(request: NextRequest) {
  return process.env.APP_URL ? new URL(process.env.APP_URL).origin : request.nextUrl.origin;
}

/** Subscription state and plan catalogue (administrators). */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { workspace } = await params;
    const { client, role } = await context(workspace);
    requireAdmin(role);
    const { data: subscription, error } = await client
      .from("workspace_subscriptions")
      .select(
        "plan,status,seats,current_period_end,cancel_at_period_end,trial_end,stripe_customer_id",
      )
      .eq("workspace_id", workspace)
      .maybeSingle();
    databaseError(error);
    const { count, error: countError } = await client
      .from("memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("workspace_id", workspace)
      .in("role", ["owner", "admin", "member"]);
    databaseError(countError);
    const configured = stripeConfigured();
    const plans = await Promise.all(
      planIds.map(async (plan) => {
        const price = configured ? await priceInfo(priceForPlan(plan)) : null;
        return {
          id: plan,
          available: configured && !!priceForPlan(plan),
          amount: price?.unit_amount ?? null,
          currency: price?.currency ?? "eur",
          interval: price?.recurring?.interval ?? "month",
        };
      }),
    );
    return NextResponse.json(
      {
        configured,
        billable_seats: count ?? 0,
        subscription: subscription
          ? {
              ...subscription,
              has_customer: !!subscription.stripe_customer_id,
              stripe_customer_id: undefined,
            }
          : null,
        plans,
      },
      { headers: noStore },
    );
  } catch (error) {
    return fail(error);
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("checkout"), plan: z.enum(planIds as [PlanId, ...PlanId[]]) }),
  z.object({ action: z.literal("portal") }),
]);

/** Starts Stripe Checkout or opens the customer portal (owner/admin only). */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    checkOrigin(request);
    const { workspace } = await params;
    const { role, user } = await context(workspace, true);
    requireAdmin(role);
    if (!stripeConfigured())
      throw new ApiError("La facturation n’est pas configurée sur ce serveur.", 503);
    const body = actionSchema.parse(await jsonBody(request));
    const admin = adminDb();
    const { data: state, error } = await admin.rpc("billing_customer", {
      w: workspace,
      customer: null,
    });
    databaseError(error);
    let customer = state?.customer as string | null;
    const base = origin(request);
    if (body.action === "portal") {
      if (!customer) throw new ApiError("Aucun compte de facturation pour cet espace.");
      const session = await stripe<{ url: string }>("POST", "/billing_portal/sessions", {
        customer,
        return_url: `${base}/app/settings?workspace=${workspace}#facturation`,
      });
      return NextResponse.json({ url: session.url }, { headers: noStore });
    }
    if (state?.subscription && ["active", "trialing", "past_due"].includes(state.status))
      throw new ApiError(
        "Un abonnement est déjà actif : modifiez-le depuis le portail de facturation.",
        409,
      );
    const price = priceForPlan(body.plan);
    if (!price) throw new ApiError("Cette offre n’est pas disponible.", 503);
    if (!customer) {
      // One customer per workspace: the idempotency key and billing_customer prevent duplicates.
      const created = await stripe<{ id: string }>(
        "POST",
        "/customers",
        {
          name: String(state?.workspace_name ?? "Espace Zyliad").slice(0, 200),
          email: user.email,
          metadata: { workspace_id: workspace },
        },
        `customer:${workspace}`,
      );
      const { data: saved, error: saveError } = await admin.rpc("billing_customer", {
        w: workspace,
        customer: created.id,
      });
      databaseError(saveError);
      customer = saved?.customer as string;
    }
    const session = await stripe<{ url: string }>(
      "POST",
      "/checkout/sessions",
      {
        mode: "subscription",
        customer,
        client_reference_id: workspace,
        line_items: [{ price, quantity: Math.max(1, Number(state?.seats) || 1) }],
        subscription_data: { metadata: { workspace_id: workspace } },
        allow_promotion_codes: true,
        billing_address_collection: "required",
        tax_id_collection: { enabled: true },
        customer_update: { address: "auto", name: "auto" },
        ...(process.env.STRIPE_AUTOMATIC_TAX === "true"
          ? { automatic_tax: { enabled: true } }
          : {}),
        locale: "fr",
        success_url: `${base}/app/settings?workspace=${workspace}&checkout=success#facturation`,
        cancel_url: `${base}/app/settings?workspace=${workspace}&checkout=cancel#facturation`,
      },
      `checkout:${workspace}:${body.plan}:${Math.floor(Date.now() / 60000)}`,
    );
    return NextResponse.json({ url: session.url }, { headers: noStore });
  } catch (error) {
    if (error instanceof StripeError)
      return fail(
        new ApiError(
          "Le service de paiement n’a pas pu traiter la demande. Réessayez.",
          502,
          error.code,
        ),
      );
    return fail(error);
  }
}
