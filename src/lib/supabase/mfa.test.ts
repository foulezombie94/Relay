import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { hasVerifiedFactor, secondFactorPending, tokenClaim } from "./mfa";

const token = (claims: Record<string, unknown>) =>
  "x." + Buffer.from(JSON.stringify(claims)).toString("base64url") + ".y";
const client = (access_token: string, id = "u1") =>
  ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token, user: { id } } } })),
    },
  }) as unknown as SupabaseClient;
const user = (status?: string) =>
  ({
    id: "u1",
    factors: status ? [{ id: "f", status, factor_type: "totp" }] : [],
  }) as unknown as User;

describe("second factor enforcement", () => {
  it("decodes JWT claims safely", () => {
    expect(tokenClaim(token({ aal: "aal2" }), "aal")).toBe("aal2");
    expect(tokenClaim("garbage", "aal")).toBeUndefined();
    expect(tokenClaim(undefined, "aal")).toBeUndefined();
  });
  it("only counts verified factors", () => {
    expect(hasVerifiedFactor(user("verified"))).toBe(true);
    expect(hasVerifiedFactor(user("unverified"))).toBe(false);
  });
  it("requires aal2 once a factor is verified", async () => {
    expect(await secondFactorPending(client(token({ aal: "aal1" })), user())).toBe(false);
    expect(await secondFactorPending(client(token({ aal: "aal1" })), user("verified"))).toBe(true);
    expect(await secondFactorPending(client(token({ aal: "aal2" })), user("verified"))).toBe(false);
    expect(
      await secondFactorPending(client(token({ aal: "aal2" }), "someone-else"), user("verified")),
    ).toBe(true);
  });
});
