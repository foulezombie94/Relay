import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ context: vi.fn(), manage: vi.fn() }));
vi.mock("@/lib/api/context", async (original) => ({
  ...(await original<typeof import("@/lib/api/context")>()),
  context: mocks.context,
}));
vi.mock("@/lib/integrations/platform/store", async (original) => ({
  ...(await original<typeof import("@/lib/integrations/platform/store")>()),
  manageIntegrations: mocks.manage,
}));
import { ApiError } from "@/lib/api/context";
import { GET, PATCH } from "./route";
const workspace = "00000000-0000-4000-8000-000000000001";
const params = { params: Promise.resolve({ workspace }) };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FEATURE_INTEGRATION_PLATFORM", "false");
  mocks.context.mockResolvedValue({ client: {}, role: "member" });
});
afterEach(() => vi.unstubAllEnvs());
it("returns the entire catalog when rollout is disabled without reading private tables", async () => {
  const response = await GET(
    new NextRequest(`https://zyliad.example/api/${workspace}/integration-platform`),
    params,
  );
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(body.apps).toHaveLength(19);
  expect(body.connections).toEqual([]);
  expect(mocks.context).toHaveBeenCalledWith(workspace);
  expect(mocks.manage).not.toHaveBeenCalled();
});
it("rejects the wrong workspace before returning catalog or connection metadata", async () => {
  mocks.context.mockRejectedValue(new ApiError("Forbidden", 403));
  expect(
    (await GET(new NextRequest("https://zyliad.example/api/other/integration-platform"), params))
      .status,
  ).toBe(403);
  expect(mocks.manage).not.toHaveBeenCalled();
});
it("rejects non-admin policy edits and cross-origin requests", async () => {
  const body = {
    integration: "gmail",
    read: true,
    create: false,
    update: false,
    send: false,
    delete: false,
  };
  const request = (origin: string) =>
    new NextRequest(`https://zyliad.example/api/${workspace}/integration-platform`, {
      method: "PATCH",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  expect((await PATCH(request("https://evil.example"), params)).status).toBe(403);
  expect(mocks.context).not.toHaveBeenCalled();
  expect((await PATCH(request("https://zyliad.example"), params)).status).toBe(403);
  expect(mocks.manage).not.toHaveBeenCalled();
});
