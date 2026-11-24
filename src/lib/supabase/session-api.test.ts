import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  single: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  db: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from, rpc: mocks.rpc })),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), flush: vi.fn() }));
vi.mock("@/lib/observability/logger", () => ({ logEvent: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
import { context, fail } from "@/lib/api/context";
import { GET as workspaces } from "@/app/api/workspaces/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-a" } }, error: null });
  mocks.single.mockResolvedValue({ data: { role: "member" }, error: null });
  // No workspace hidden by a 2FA requirement unless a test says otherwise.
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  const query = { select: vi.fn(() => query), eq: vi.fn(() => query), single: mocks.single };
  mocks.from.mockReturnValue(query);
});
afterEach(() => vi.unstubAllGlobals());

describe("authenticated API session boundaries", () => {
  it("returns 503 for temporary Auth outages without touching CRM data", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError("sensitive upstream info", 503),
    });
    const response = await workspaces();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toContain("temporairement indisponible");
    expect(body.error).not.toContain("sensitive upstream info");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires login after actual revocation even if a client supplies user data", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-a" } },
      error: new AuthApiError("Revoked", 401, "session_not_found"),
    });
    const response = await workspaces();
    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("never accepts a persistent session as a substitute for current workspace membership", async () => {
    mocks.single.mockResolvedValue({ data: null, error: null });
    await expect(context("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", true)).rejects.toMatchObject({
      status: 403,
    });
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });
  it("explains a membership hidden by the workspace 2FA requirement", async () => {
    mocks.single.mockResolvedValue({ data: null, error: null });
    mocks.rpc.mockResolvedValue({
      data: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "B" }],
      error: null,
    });
    await expect(context("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")).rejects.toMatchObject({
      status: 403,
      code: "mfa_required",
    });
  });

  it("continues to reject writes by viewers", async () => {
    mocks.single.mockResolvedValue({ data: { role: "viewer" }, error: null });
    await expect(context("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", true)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("does not downgrade a network failure to 401 on regular CRM operations", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError("offline", 0),
    });
    const response = await context("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa").then(() => {
      throw new Error("Unauthorized acceptance");
    }, fail);
    expect(response.status).toBe(503);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
