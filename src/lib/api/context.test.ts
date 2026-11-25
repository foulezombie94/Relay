import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), flush: vi.fn() }));
vi.mock("@/lib/observability/logger", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/supabase/mfa", () => ({ secondFactorPending: async () => false }));
const supabase = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  db: async () => ({
    auth: { getUser: supabase.getUser, getSession: supabase.getSession },
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
    supabase.getSession.mockReset();
    supabase.getSession.mockRejectedValue(new Error("no local session"));
    supabase.getUser.mockReset();
    supabase.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
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
  it("reads the membership while Auth verifies the user, for the verified user only (P-02)", async () => {
    const workspace = "9f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
    const reads: string[] = [];
    let verify!: (value: unknown) => void;
    supabase.getSession.mockResolvedValue({ data: { session: { user: { id: "user-1" } } } });
    supabase.getUser.mockReturnValue(new Promise((resolve) => (verify = resolve)));
    const membershipQuery = () => {
      const filters: Record<string, string> = {};
      const q = {
        eq: (column: string, value: string) => ((filters[column] = value), q),
        single: async () => {
          reads.push(filters.user_id);
          return { data: { role: "member" }, error: null };
        },
      };
      return q;
    };
    supabase.from.mockImplementation(() => ({ select: membershipQuery }));
    const pending = context(workspace);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The membership was requested before Auth answered.
    expect(reads).toEqual(["user-1"]);
    verify({ data: { user: { id: "user-1" } }, error: null });
    await expect(pending).resolves.toMatchObject({ role: "member" });
    expect(reads).toEqual(["user-1"]);
    // A session cookie naming another user than the one Auth verified is not trusted.
    reads.length = 0;
    supabase.getSession.mockResolvedValue({ data: { session: { user: { id: "someone-else" } } } });
    supabase.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    await expect(context(workspace)).resolves.toMatchObject({ role: "member" });
    expect(reads).toEqual(["someone-else", "user-1"]);
    // No verified user: refused, whatever the early read returned.
    supabase.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(context(workspace)).rejects.toMatchObject({ status: 401 });
  });
});
