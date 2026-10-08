import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/api/context", async (original) => ({
  ...(await original<typeof import("@/lib/api/context")>()),
  context: mocks.context,
  checkOrigin: vi.fn(),
}));
vi.mock("@/lib/agent/tools", () => ({ rpc: mocks.rpc }));
vi.mock("@/lib/agent/runner", () => ({ runAgent: vi.fn() }));
import { POST } from "./route";
import { POST as assistantPost } from "../route";
const id = "85187231-cb96-4f91-949a-b1b4a0e32cc0";
const digest = "a".repeat(64);
const action = {
  id,
  kind: "create_task",
  status: "pending",
  input: { title: "Appeler Thomas" },
  confirmation_digest: digest,
};
const post = (body: unknown) =>
  POST(
    new NextRequest("https://relay.test/api/workspace/assistant/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ workspace: "workspace" }) },
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ client: {}, user: { id: "user" } });
  mocks.rpc.mockImplementation(async (_client, name, args) =>
    name === "agent_apply"
      ? { ...action, status: "completed" }
      : name === "agent_confirmation_denied"
        ? null
        : args.operation === "cancel"
          ? { ...action, status: "cancelled" }
          : action,
  );
});
describe("exact user confirmation endpoint", () => {
  it("disables the legacy proposal mutation path instead of bypassing exact confirmation", async () => {
    const r = await assistantPost(
      new NextRequest("https://relay.test/api/workspace/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          conversation_id: id,
          message_id: "message",
          index: 0,
        }),
      }),
      { params: Promise.resolve({ workspace: "workspace" }) },
    );
    expect(r.status).toBe(410);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires the digest of the preview and logs refusal without applying", async () => {
    for (const expected_digest of [undefined, "b".repeat(64)]) {
      const r = await post({ id, operation: "confirm", expected_digest });
      expect(r.status).toBe(409);
    }
    expect(mocks.rpc.mock.calls.some(([, name]) => name === "agent_apply")).toBe(false);
    expect(mocks.rpc.mock.calls.some(([, name]) => name === "agent_confirmation_denied")).toBe(
      true,
    );
  });
  it("passes only the exact action ID and digest to the transactional boundary", async () => {
    expect((await post({ id, operation: "confirm", expected_digest: digest })).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith({}, "agent_apply", {
      w: "workspace",
      action_id: id,
      expected_digest: digest,
    });
  });
  it("refuses hidden parameter changes in the confirmation request", async () => {
    expect(
      (
        await post({
          id,
          operation: "confirm",
          expected_digest: digest,
          input: { title: "Different" },
        })
      ).status,
    ).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("refusing an action only cancels that ID and never executes it", async () => {
    expect((await post({ id, operation: "cancel" })).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith({}, "agent_action", {
      w: "workspace",
      operation: "cancel",
      payload: { id },
    });
  });
});
