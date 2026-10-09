import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn(), abort: vi.fn() }));
vi.mock("@/lib/api/context", async (original) => ({
  ...(await original<typeof import("@/lib/api/context")>()),
  context: mocks.context,
}));
import { ApiError } from "@/lib/api/context";
import { GET } from "./route";
const workspace = "85187231-cb96-4f91-949a-b1b4a0e32cc0";
function request(id = workspace) {
  return GET(new NextRequest(`https://relay.test/api/${id}/assistant/usage`), {
    params: Promise.resolve({ workspace: id }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ client: { rpc: mocks.rpc }, user: { id: "current-user" } });
  mocks.rpc.mockReturnValue({ abortSignal: mocks.abort });
  mocks.abort.mockResolvedValue({
    data: {
      settings: {
        daily_runs: 100,
        monthly_token_limit: 3000000,
        workspace_id: workspace,
        secret: "must-not-leak",
      },
      month: null,
      runs: [],
      capability_hash: "must-not-leak",
    },
    error: null,
  });
});
describe("Settings usage boundary", () => {
  it("reuses the authenticated workspace RPC and returns only allowlisted counters", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("agent_runtime", {
      w: workspace,
      operation: "usage",
      payload: {},
    });
    expect(mocks.abort).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(mocks.context).toHaveBeenCalledTimes(2);
    const json = await response.json();
    expect(json.data).toEqual({
      settings: { daily_runs: 100, monthly_token_limit: 3000000 },
      month: null,
      runs: [],
    });
    expect(JSON.stringify(json)).not.toContain("must-not-leak");
  });
  it("does not retrieve counters without current membership", async () => {
    mocks.context.mockRejectedValue(new ApiError("denied", 403));
    expect((await request()).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("discards data after membership revocation", async () => {
    mocks.context
      .mockResolvedValueOnce({ client: { rpc: mocks.rpc } })
      .mockRejectedValueOnce(new ApiError("revoked", 403));
    expect((await request()).status).toBe(403);
  });
  it("rejects malformed workspaces before making any database call", async () => {
    expect((await request("not-a-workspace")).status).toBe(400);
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
