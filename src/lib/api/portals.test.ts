import { beforeEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({
  db: vi.fn(),
  auth: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  sign: vi.fn(),
  results: [] as unknown[],
  calls: [] as unknown[][],
}));
vi.mock("@/lib/supabase/server", () => ({ db: mock.db }));
vi.mock("@/lib/supabase/session", () => ({ assertAuthAvailable: vi.fn() }));
vi.mock("./context", () => ({
  ApiError: class extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
  databaseError: (error: { code?: string } | null) => {
    if (error)
      throw Object.assign(new Error("Database operation failed"), {
        status: error.code === "42501" ? 403 : 500,
      });
  },
}));
import {
  portalSession,
  portalContext,
  portalDirectory,
  portalSummariesForWorkspace,
  portalDetail,
  portalDocument,
  postPortalMessage,
  portalMessageBody,
  portalListFilters,
  portalDetailFilters,
} from "./portals";
const id = "10000000-0000-4000-8000-000000000001",
  workspace = "20000000-0000-4000-8000-000000000001",
  userId = "30000000-0000-4000-8000-000000000001",
  document = "40000000-0000-4000-8000-000000000001";
const summary = {
  id,
  item_count: 0,
  step_count: 0,
  completed_steps: 0,
  document_count: 0,
  open_decisions: 0,
  comment_count: 0,
  next_due_at: null,
  last_activity_at: "2026-10-10T12:00:00Z",
  can_comment: true,
};
let client: SupabaseClient;
beforeEach(() => {
  vi.clearAllMocks();
  mock.results = [];
  mock.calls = [];
  mock.from.mockImplementation((table: string) => {
    const methods = [
      "select",
      "eq",
      "in",
      "or",
      "limit",
      "order",
      "range",
      "insert",
      "single",
      "maybeSingle",
    ];
    const builder: Record<string, unknown> = {};
    for (const method of methods)
      builder[method] = (...args: unknown[]) => {
        mock.calls.push([table, method, ...args]);
        if (method === "single" || method === "maybeSingle")
          return Promise.resolve(mock.results.shift());
        return builder;
      };
    builder.then = (resolve: (value: unknown) => void) =>
      Promise.resolve(mock.results.shift()).then(resolve);
    return builder;
  });
  mock.auth.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  mock.rpc.mockImplementation((name: string) =>
    Promise.resolve({ data: name === "claim_invitations" ? null : [summary], error: null }),
  );
  mock.sign.mockResolvedValue({
    data: { signedUrl: "https://files.example.invalid/signed-fixture" },
    error: null,
  });
  client = {
    from: mock.from,
    rpc: mock.rpc,
    auth: { getUser: mock.auth },
    storage: { from: () => ({ createSignedUrl: mock.sign }) },
  } as unknown as SupabaseClient;
  mock.db.mockResolvedValue(client);
});
const context = () => ({
  client,
  user: {
    id: userId,
    aud: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-10-10T12:00:00Z",
  },
  portal: { id, name: "Project", workspace_id: workspace },
  summary,
});
describe("portal authorization, projections and retries", () => {
  it("requires a server-verified session before querying invitations", async () => {
    mock.auth.mockResolvedValue({ data: { user: null }, error: null });
    await expect(portalSession()).rejects.toMatchObject({ status: 401 });
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("rejects a hidden or disabled portal", async () => {
    mock.results = [{ data: null, error: null }];
    await expect(portalContext(id)).rejects.toMatchObject({ status: 403 });
    expect(mock.calls).toContainEqual(["portals", "eq", "enabled", true]);
  });
  it("validates request IDs before database access", async () => {
    await expect(portalContext("foreign-id")).rejects.toThrow();
    expect(mock.db).not.toHaveBeenCalled();
  });
  it("never falls back to privileged reads if the directory fails", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    await expect(portalDirectory(client, portalListFilters.parse({}))).rejects.toMatchObject({
      status: 403,
    });
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("binds summary IDs to the route workspace before invoking the RPC", async () => {
    mock.results = [{ data: [], error: null }];
    await expect(portalSummariesForWorkspace(client, workspace, [id])).rejects.toMatchObject({
      status: 403,
    });
    expect(mock.calls).toContainEqual(["portals", "eq", "workspace_id", workspace]);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("rejects unbounded filters and custom authority fields", () => {
    for (const value of [
      { page: -1 },
      { page: 10001 },
      { q: "a".repeat(201) },
      { workspace_id: workspace },
      { state: "other" },
    ])
      expect(portalListFilters.safeParse(value).success).toBe(false);
    expect(portalDetailFilters.safeParse({ type: "token" }).success).toBe(false);
  });
  it("bounds both pages, filters source types and strips participant IDs", async () => {
    mock.results = [
      { data: [], count: 4, error: null },
      {
        data: [
          { id, content: "Safe", created_at: "2026-10-10", author_id: userId, token: "hidden" },
        ],
        count: 26,
        error: null,
      },
    ];
    const data = await portalDetail(
      context(),
      portalDetailFilters.parse({ type: "step", items_page: 1, comments_page: 1 }),
    );
    expect(data.comments[0]).toEqual({ id, content: "Safe", created_at: "2026-10-10", own: true });
    expect(mock.calls).toContainEqual(["portal_items", "range", 50, 99]);
    expect(mock.calls).toContainEqual(["portal_comments", "range", 25, 49]);
    expect(mock.calls).toContainEqual(["portal_items", "eq", "type", "step"]);
    for (const table of ["portal_items", "portal_comments"])
      expect(mock.calls).toContainEqual([table, "eq", "workspace_id", workspace]);
  });
  it("requires explicit document sharing before touching storage", async () => {
    mock.results = [{ data: null, error: null }];
    await expect(portalDocument(context(), document)).rejects.toMatchObject({ status: 403 });
    expect(mock.sign).not.toHaveBeenCalled();
  });
  it("uses only the authorized workspace and a 60-second document URL", async () => {
    mock.results = [
      { data: { id }, error: null },
      { data: { path: "safe/path" }, error: null },
    ];
    await expect(portalDocument(context(), document)).resolves.toContain("files.example.invalid");
    expect(mock.sign).toHaveBeenCalledWith("safe/path", 60);
    expect(mock.calls).toContainEqual(["documents", "eq", "workspace_id", workspace]);
  });
  it("checks current commenting permission before writes and replays", async () => {
    await expect(
      postPortalMessage(
        { ...context(), summary: { ...summary, can_comment: false } },
        { content: "Hello" },
        id,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("never accepts a forged workspace or author", async () => {
    await expect(
      postPortalMessage(context(), { content: "Hello", workspace_id: "foreign" }, id),
    ).rejects.toThrow();
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("confirms a write tied to the session author and idempotency key", async () => {
    mock.results = [{ data: { id }, error: null }];
    await expect(postPortalMessage(context(), { content: " Hello " }, id)).resolves.toEqual({ id });
    expect(mock.calls).toContainEqual([
      "portal_comments",
      "insert",
      { id, workspace_id: workspace, portal_id: id, content: "Hello", author_id: userId },
    ]);
  });
  it("replays only the same user's exact confirmed message", async () => {
    mock.results = [
      { data: null, error: { code: "23505" } },
      { data: { id, content: "Hello" }, error: null },
    ];
    await expect(postPortalMessage(context(), { content: "Hello" }, id)).resolves.toEqual({ id });
    expect(mock.calls).toContainEqual(["portal_comments", "eq", "author_id", userId]);
    expect(mock.calls).toContainEqual(["portal_comments", "eq", "portal_id", id]);
  });
  it("rejects conflicting replays and unconfirmed insert responses", async () => {
    mock.results = [
      { data: null, error: { code: "23505" } },
      { data: { id, content: "Different" }, error: null },
    ];
    await expect(postPortalMessage(context(), { content: "Hello" }, id)).rejects.toMatchObject({
      status: 409,
    });
    mock.results = [{ data: null, error: null }];
    await expect(postPortalMessage(context(), { content: "Hello" }, id)).rejects.toMatchObject({
      status: 500,
    });
  });
  it("bounds raw bodies before parsing and handles malformed JSON", async () => {
    const req = (body: string) =>
      new NextRequest("http://localhost/api/portal/" + id, { method: "POST", body });
    await expect(portalMessageBody(req("x".repeat(32769)))).rejects.toMatchObject({ status: 413 });
    await expect(portalMessageBody(req("broken"))).rejects.toMatchObject({ status: 400 });
    await expect(portalMessageBody(req('{"content":"Hello"}'))).resolves.toEqual({
      content: "Hello",
    });
  });
});
