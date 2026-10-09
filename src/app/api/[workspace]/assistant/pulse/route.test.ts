import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ context: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/api/context", async (original) => ({
  ...(await original<typeof import("@/lib/api/context")>()),
  context: mocks.context,
}));
vi.mock("@/lib/api/assistant-pulse", () => ({ readAssistantPulse: mocks.read }));
import { ApiError } from "@/lib/api/context";
import { GET } from "./route";
const workspace = "85187231-cb96-4f91-949a-b1b4a0e32cc0";
const request = () =>
  GET(new NextRequest("https://relay.test/api/" + workspace + "/assistant/pulse"), {
    params: Promise.resolve({ workspace }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ client: {}, user: { id: "current-user" } });
  mocks.read.mockResolvedValue({ counts: { attention: 4 }, signals: [] });
});
describe("Pulse session boundary", () => {
  it("uses the current session, rechecks membership, and prevents shared caching", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.read).toHaveBeenCalledWith({}, workspace, "current-user", expect.any(AbortSignal));
    expect(mocks.context).toHaveBeenCalledTimes(2);
  });
  it("never reads Pulse without current workspace membership", async () => {
    mocks.context.mockRejectedValue(new ApiError("denied", 403));
    expect((await request()).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("discards a calculated result if access was revoked before delivery", async () => {
    mocks.context
      .mockResolvedValueOnce({ client: {}, user: { id: "user" } })
      .mockRejectedValueOnce(new ApiError("revoked", 403));
    const response = await request();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "revoked" });
  });
});
