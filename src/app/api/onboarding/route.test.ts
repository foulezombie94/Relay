import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AuthRetryableFetchError } from "@supabase/supabase-js";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  db: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), flush: vi.fn() }));
vi.mock("@/lib/observability/logger", () => ({ logEvent: vi.fn() }));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: vi.fn(),
}));
import { POST } from "./route";
const id = "550e8400-e29b-41d4-a716-446655440000";
const values = {
  name: " Horizon ",
  fullName: " Camille Martin ",
  timezone: "Europe/Paris",
  attemptId: id,
};
function req(body: unknown = values, origin = "http://localhost") {
  return new NextRequest("http://localhost/api/onboarding", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-a" } }, error: null });
  mocks.rpc.mockResolvedValue({ data: id, error: null });
});
describe("atomic authenticated onboarding API", () => {
  it("uses validated values and the authenticated RPC without accepting a supplied owner", async () => {
    const response = await POST(req({ ...values, owner_id: "attacker" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id });
    expect(mocks.rpc).toHaveBeenCalledWith("create_onboarding_workspace", {
      label: "Horizon",
      person_name: "Camille Martin",
      zone: "Europe/Paris",
      attempt: id,
    });
  });
  it("rejects cross-origin writes before accessing Auth or CRM data", async () => {
    expect((await POST(req(values, "https://evil.example"))).status).toBe(403);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it.each([
    { ...values, name: " " },
    { ...values, timezone: "bad/zone" },
    { ...values, fullName: " " },
    { ...values, attemptId: "invalid" },
  ])("validates onboarding fields before calling the database: %o", async (body) => {
    expect((await POST(req(body))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires current authentication and reports temporary outages separately", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await POST(req())).status).toBe(401);
    mocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new AuthRetryableFetchError("private details", 503),
    });
    const response = await POST(req());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private details");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("never accepts an empty database acknowledgement", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect((await POST(req())).status).toBe(502);
  });
  it("preserves creation conflicts as retryable UI errors", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "private SQL details" },
    });
    const response = await POST(req());
    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).not.toContain("private SQL details");
  });
});
