import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ context: vi.fn(), load: vi.fn(), call: vi.fn() }));
vi.mock("@/lib/api/context", async (original) => ({
  ...(await original<typeof import("@/lib/api/context")>()),
  context: mocks.context,
}));
vi.mock("@/lib/integrations/platform/api", async (original) => ({
  ...(await original<typeof import("@/lib/integrations/platform/api")>()),
  integrationServices: () => ({ runtime: { load: mocks.load }, store: { call: mocks.call } }),
}));
import { ApiError } from "@/lib/api/context";
import { fixtureContext } from "@/lib/integrations/platform/test-support";
import { GET } from "./route";
const fixture = fixtureContext();
const params = {
  params: Promise.resolve({
    workspace: fixture.actor.workspaceId,
    connection: fixture.connection.id,
  }),
};
const request = (resource: string) =>
  new NextRequest(
    `https://zyliad.example/api/${fixture.actor.workspaceId}/integration-platform/${fixture.connection.id}?resource=${encodeURIComponent(resource)}`,
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ user: { id: fixture.actor.userId } });
  mocks.load.mockResolvedValue(fixture);
  mocks.call.mockResolvedValue({
    enabled: true,
    last_sync_at: null,
    encrypted_cursor: "private-cursor",
    config: { private: true },
  });
});
it("returns selected sync metadata without exposing cursors or credentials", async () => {
  const response = await GET(request("gmail:inbox"), params);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ enabled: true, last_sync_at: null });
  expect(mocks.call).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: fixture.actor.userId,
      workspaceId: fixture.actor.workspaceId,
    }),
    "sync_get",
    { connection_id: fixture.connection.id, resource: "gmail:inbox" },
  );
});
it("refuses an unenabled integration and malformed resource", async () => {
  mocks.load.mockResolvedValue({
    ...fixture,
    connection: { ...fixture.connection, enabled_integrations: ["google-calendar"] },
  });
  expect((await GET(request("gmail:inbox"), params)).status).toBe(403);
  expect((await GET(request("https://attacker.example"), params)).status).toBe(400);
  expect(mocks.call).not.toHaveBeenCalled();
});
it("rejects another workspace or another user's connection before resource lookup", async () => {
  mocks.context.mockRejectedValueOnce(new ApiError("Forbidden", 403));
  expect((await GET(request("gmail:inbox"), params)).status).toBe(403);
  expect(mocks.load).not.toHaveBeenCalled();
  mocks.load.mockRejectedValueOnce(new ApiError("Forbidden", 403));
  expect((await GET(request("gmail:inbox"), params)).status).toBe(403);
  expect(mocks.call).not.toHaveBeenCalled();
});
