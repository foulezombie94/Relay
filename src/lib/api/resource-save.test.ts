import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ from: vi.fn(), context: vi.fn(), results: [] as unknown[] }));
vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), flush: vi.fn() }));
vi.mock("@/lib/observability/logger", () => ({ logEvent: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/lib/api/context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./context")>()),
  context: mocks.context,
}));
import { POST, PATCH } from "@/app/api/[workspace]/[resource]/route";
import { ApiError } from "./context";
const workspace = "10000000-0000-4000-8000-000000000001";
const id = "20000000-0000-4000-8000-000000000002";
const objectId = "30000000-0000-4000-8000-000000000003";
const params = { params: Promise.resolve({ workspace, resource: "records" }) };
const values = { object_id: objectId, display_name: "Alice", email: "a@example.test" };
function req(method: string, body: unknown, key?: string) {
  return new NextRequest(`https://relay.example/api/${workspace}/records`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "https://relay.example",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.results = [];
  const result = () => Promise.resolve(mocks.results.shift() ?? { data: [], error: null });
  const query = {
    select: vi.fn(() => query),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    single: vi.fn(result),
    maybeSingle: vi.fn(result),
    then: (resolve: (value: unknown) => unknown) => result().then(resolve),
  };
  mocks.from.mockReturnValue(query);
  mocks.context.mockResolvedValue({
    client: { from: mocks.from },
    user: { id },
    role: "owner",
    workspaceId: workspace,
  });
});
describe("resource save contract", () => {
  it("returns the inserted row after checking the DB result", async () => {
    mocks.results.push(
      { data: [], error: null },
      { data: { ...values, id, workspace_id: workspace }, error: null },
    );
    const response = await POST(req("POST", values, id), params);
    expect(response.status).toBe(201);
    expect((await response.json()).data.id).toBe(id);
  });
  it.each([null, {}, { ...values, email: "wrong" }, { ...values, object_id: "invalid" }])(
    "rejects invalid POST input %s before inserting",
    async (body) => {
      const response = await POST(req("POST", body), params);
      expect(response.status).toBe(400);
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );
  it("returns 400 for malformed JSON", async () => {
    const request = new NextRequest("https://relay.example/api/records", {
      method: "POST",
      body: "{",
    });
    expect((await POST(request, params)).status).toBe(400);
  });
  it.each([
    null,
    {},
    { id, version: 1, values: null },
    { id, version: -1, values: { display_name: "Alice" } },
    { id, version: 1, values: {} },
  ])("rejects invalid PATCH envelope %s", async (body) => {
    expect((await PATCH(req("PATCH", body), params)).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("treats zero updated rows as a conflict", async () => {
    mocks.results.push({ data: null, error: null });
    expect(
      (await PATCH(req("PATCH", { id, version: 1, values: { display_name: "Alice" } }), params))
        .status,
    ).toBe(409);
  });
  it.each([null, {}, [], { id: "invalid" }])(
    "refuses an unconfirmed insert result %s",
    async (data) => {
      mocks.results.push({ data: [], error: null }, { data, error: null });
      expect((await POST(req("POST", values), params)).status).toBe(500);
    },
  );
  it.each([{}, { id: objectId }])("refuses a mismatched update result %s", async (data) => {
    mocks.results.push({ data, error: null });
    expect(
      (await PATCH(req("PATCH", { id, version: 1, values: { display_name: "Alice" } }), params))
        .status,
    ).toBe(409);
  });
  it("reuses an already committed creation after a lost response", async () => {
    const existing = { ...values, id, workspace_id: workspace };
    mocks.results.push(
      { data: [], error: null },
      { data: null, error: { code: "23505", message: "duplicate key" } },
      { data: existing, error: null },
    );
    const response = await POST(req("POST", values, id), params);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual(existing);
    expect(mocks.from.mock.results[0].value.eq).toHaveBeenCalledWith("workspace_id", workspace);
  });
  it("refuses a replay whose stored values changed", async () => {
    mocks.results.push(
      { data: [], error: null },
      { data: null, error: { code: "23505", message: "duplicate" } },
      { data: { ...values, id, workspace_id: workspace, display_name: "Changed" }, error: null },
    );
    expect((await POST(req("POST", values, id), params)).status).toBe(409);
  });
  it.each([
    ["42501", 403],
    ["23505", 409],
    ["XX000", 500],
    ["08006", 503],
  ])("maps DB refusal %s to %s without exposing internals", async (code, status) => {
    mocks.results.push(
      { data: [], error: null },
      { data: null, error: { code, message: "secret SQL stack trace" } },
    );
    const response = await POST(req("POST", values), params);
    expect(response.status).toBe(status);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
  it("fails closed if attribute definitions cannot be read", async () => {
    mocks.results.push({ data: null, error: { code: "08006", message: "ECONNRESET" } });
    expect((await POST(req("POST", values), params)).status).toBe(503);
    expect(mocks.from.mock.results[0].value.insert).not.toHaveBeenCalled();
  });
  it("keeps current membership permission checks on every write", async () => {
    mocks.context.mockRejectedValue(new ApiError("Lecture seule", 403));
    expect((await POST(req("POST", values), params)).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
