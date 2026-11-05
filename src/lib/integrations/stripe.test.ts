import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { formEncode, handleStripeEvent, subscriptionState, verifyStripeSignature } from "./stripe";

const sign = (payload: string, secret: string, t: number) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;
afterEach(() => vi.unstubAllEnvs());

describe("Stripe billing", () => {
  it("encodes nested form parameters", () => {
    expect(
      formEncode({
        line_items: [{ price: "price_1", quantity: 2 }],
        metadata: { workspace_id: "w" },
        x: undefined,
      }).join("&"),
    ).toBe(
      "line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=2&metadata%5Bworkspace_id%5D=w",
    );
  });
  it("verifies webhook signatures with tolerance", () => {
    const payload = '{"id":"evt_1"}';
    expect(verifyStripeSignature(payload, sign(payload, "whsec_a", 1000), "whsec_a", 1100)).toBe(
      true,
    );
    expect(verifyStripeSignature(payload, sign(payload, "whsec_b", 1000), "whsec_a", 1100)).toBe(
      false,
    );
    expect(
      verifyStripeSignature(payload + " ", sign(payload, "whsec_a", 1000), "whsec_a", 1100),
    ).toBe(false);
    expect(verifyStripeSignature(payload, sign(payload, "whsec_a", 1000), "whsec_a", 1400)).toBe(
      false,
    );
    expect(verifyStripeSignature(payload, null, "whsec_a")).toBe(false);
  });
  it("maps prices to plans and reads item-level periods", () => {
    vi.stubEnv("STRIPE_PRICE_PRO", "price_Pro1");
    vi.stubEnv("STRIPE_PRICE_BUSINESS", "price_Biz1");
    const state = subscriptionState({
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      items: {
        data: [
          { id: "si_1", quantity: 4, current_period_end: 1767225600, price: { id: "price_Biz1" } },
        ],
      },
    });
    expect(state).toMatchObject({
      plan: "business",
      seats: 4,
      period_end: "2026-01-01T00:00:00.000Z",
      item: "si_1",
    });
  });
  it("applies subscription events with the workspace from metadata", async () => {
    vi.stubEnv("STRIPE_PRICE_PRO", "price_Pro1");
    const rpc = vi.fn(async () => ({ data: "applied", error: null }));
    const outcome = await handleStripeEvent({ rpc } as never, {
      id: "evt_9",
      type: "customer.subscription.updated",
      created: 1767225600,
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status: "past_due",
          metadata: { workspace_id: "00000000-0000-4000-8000-000000000001" },
          items: { data: [{ id: "si_1", quantity: 2, price: { id: "price_Pro1" } }] },
        },
      },
    });
    expect(outcome).toBe("applied");
    expect(rpc).toHaveBeenCalledWith(
      "billing_apply",
      expect.objectContaining({
        event_id: "evt_9",
        plan_name: "pro",
        state: "past_due",
        seat_count: 2,
      }),
    );
    expect(
      await handleStripeEvent({ rpc } as never, {
        id: "evt_10",
        type: "invoice.paid",
        created: 1,
        data: { object: {} },
      }),
    ).toBe("ignored");
  });
});
