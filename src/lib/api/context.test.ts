import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), flush: vi.fn() }));
vi.mock("@/lib/observability/logger", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/supabase/mfa", () => ({ secondFactorPending: async () => false }));
const supabase = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  db: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from: supabase.from,
    rpc: supabase.rpc,
  }),
}));
import { checkOrigin, context } from "./context";

const url = "https://www.zyliad.online/api/9f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f/tasks";
const post = (headers: Record<string, string>) => new NextRequest(url, { method: "POST", headers });

describe("checkOrigin (audit F-04)", () => {
  it("accepts the app's own origin and refuses any other", () => {
    expect(() => checkOrigin(post({ origin: "https://www.zyliad.online" }))).not.toThrow();
    expect(() => checkOrigin(post({ origin: "https://evil.example" }))).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });
  it("refuses a cross-site browser request even when Origin was stripped", () => {
    for (const site of ["cross-site", "same-site"])
      expect(() => checkOrigin(post({ "sec-fetch-site": site })), site).toThrow(
        expect.objectContaining({ status: 403 }),
      );
  });
  it("still accepts same-origin browsers and non-browser clients without Origin", () => {
    for (const headers of [
      { "sec-fetch-site": "same-origin" },
      { "sec-fetch-site": "none" },
      {},
    ] as Record<string, string>[])
      expect(() => checkOrigin(post(headers))).not.toThrow();
  });
});

describe("context (audit F-08)", () => {
  beforeEach(() => {
    supabase.from.mockReset();
    supabase.rpc.mockReset();
  });
  it("refuses a workspace id that is not a UUID before any database filter", async () => {
    for (const id of ["abc", "x,workspace_id.neq.0", "9f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f)"])
      await expect(context(id), id).rejects.toMatchObject({ status: 403 });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
  it("still looks up the membership for a well-formed workspace id", async () => {
    const single = vi.fn(async () => ({ data: { role: "member" }, error: null }));
    const eq = vi.fn(() => ({ eq, single }));
    supabase.from.mockReturnValue({ select: () => ({ eq }) });
    await expect(context("9F1C2D3E-4B5A-4C6D-8E7F-0A1B2C3D4E5F")).resolves.toMatchObject({
      role: "member",
    });
    expect(supabase.from).toHaveBeenCalledWith("memberships");
  });
});
