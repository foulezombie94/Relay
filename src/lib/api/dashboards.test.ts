import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/agent/tools", () => ({ rpc: mocks.rpc }));
vi.mock("./context", () => ({
  ApiError: class extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
  databaseError: vi.fn(),
}));
import { dashboardResults, dashboardDetails, calendarMonth } from "./dashboards";
import { ApiError } from "./context";
import { dashboardTemplate, defaultTile } from "@/lib/domain/dashboards";
const client = {} as SupabaseClient;
const result = {
  data: [],
  totals: [],
  total: 0,
  partial: false,
  missing_history: 0,
  coverage: "Exact",
};
const entries = {
  data: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      record_id: null,
      title: "Visible source",
      stage: null,
      status: "open",
      occurred_at: "2026-10-10T12:00:00Z",
      currency: null,
      amount: null,
    },
  ],
  total: 1,
  next_cursor: null,
  partial: false,
};
beforeEach(() => {
  mocks.rpc
    .mockReset()
    .mockImplementation(async (_c, _n, args) => args.requests.map(() => ({ result })));
});
describe("dashboard backend boundaries", () => {
  it("binds every calculation to the current workspace and limits concurrency", async () => {
    let active = 0,
      max = 0;
    mocks.rpc.mockImplementation(async (_c, _n, args) => {
      active++;
      max = Math.max(max, active);
      await Promise.resolve();
      active--;
      return args.requests.map(() => ({ result }));
    });
    const r = await dashboardResults(client, "current-workspace", dashboardTemplate("sales"));
    expect(r.tiles).toHaveLength(8);
    expect(max).toBe(1);
    expect(mocks.rpc.mock.calls[0][1]).toBe("dashboard_batch");
    expect(mocks.rpc.mock.calls[0][2].requests).toHaveLength(8);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    for (const call of mocks.rpc.mock.calls) expect(call[2].w).toBe("current-workspace");
  });
  it("never substitutes a previous result after permission revocation", async () => {
    mocks.rpc.mockRejectedValue(new ApiError("Revoked", 403));
    await expect(dashboardResults(client, "w", dashboardTemplate("sales"))).rejects.toMatchObject({
      status: 403,
    });
  });
  it("reports a failed calculation without claiming a successful value", async () => {
    mocks.rpc.mockRejectedValue(new ApiError("Timeout", 408));
    const r = await dashboardResults(client, "w", {
      ...dashboardTemplate("sales"),
      config: [defaultTile()],
    });
    expect(r.tiles[0].error).toBe("Timeout");
    expect(r.tiles[0].current).toBeUndefined();
  });
  it("rejects a detail index outside the saved configuration", async () => {
    await expect(
      dashboardDetails(
        client,
        "w",
        dashboardTemplate("sales"),
        dashboardTemplate("sales").settings,
        23,
        null,
        null,
        null,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not query any source for plain content blocks", async () => {
    const dashboard = {
      ...dashboardTemplate("sales"),
      config: [
        defaultTile({ visual: "text", content: "Notes" }),
        defaultTile({ visual: "divider" }),
      ],
    };
    const r = await dashboardResults(client, "workspace-a", dashboard);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(r.tiles).toHaveLength(2);
    expect(r.tiles.every((tile) => !tile.error)).toBe(true);
  });
  it("uses at most three current-user source reads and strips unselected fields", async () => {
    let active = 0,
      max = 0;
    mocks.rpc.mockImplementation(async (_client, name, args) => {
      expect(name).toBe("dashboard_details");
      expect(args.w).toBe("workspace-a");
      expect(args.group_by).toBe("none");
      expect(args.metric).toBe("count");
      active++;
      max = Math.max(max, active);
      await Promise.resolve();
      active--;
      return {
        ...entries,
        data: [{ ...entries.data[0], body: "Private body", access_token: "must-not-pass" }],
      };
    });
    const r = await dashboardResults(client, "workspace-a", {
      ...dashboardTemplate("sales"),
      config: Array.from({ length: 8 }, () => defaultTile({ visual: "list" })),
    });
    expect(max).toBeLessThanOrEqual(3);
    expect(mocks.rpc).toHaveBeenCalledTimes(8);
    expect(r.tiles.every((tile) => tile.entries?.total === 1)).toBe(true);
    expect(JSON.stringify(r)).not.toContain("Private body");
    expect(JSON.stringify(r)).not.toContain("must-not-pass");
  });
  it("intersects calendar navigation with all global and widget restrictions", async () => {
    mocks.rpc.mockResolvedValue(entries);
    const dashboard = {
      ...dashboardTemplate("sales"),
      config: [
        defaultTile({
          kind: "meeting",
          visual: "calendar",
          date_field: "occurred",
          since: "2026-10-10T00:00:00Z",
        }),
      ],
    };
    await dashboardDetails(
      client,
      "workspace-a",
      dashboard,
      {
        period: "custom",
        since: "2026-10-05",
        until: "2026-10-20",
        compare: false,
        refresh_seconds: 0,
      },
      0,
      null,
      null,
      null,
      "2026-10",
    );
    expect(mocks.rpc.mock.calls[0][2].filters).toMatchObject({
      since: "2026-10-10T00:00:00Z",
      until: "2026-10-21T00:00:00.000Z",
    });
    await dashboardDetails(
      client,
      "workspace-a",
      dashboard,
      {
        period: "custom",
        since: "2026-10-05",
        until: "2026-10-20",
        compare: false,
        refresh_seconds: 0,
      },
      0,
      null,
      null,
      null,
      "2026-09",
    );
    expect(mocks.rpc.mock.calls[1][2].filters.empty).toBe(true);
  });
  it("normalizes the calendar's initial month to UTC", () => {
    expect(calendarMonth(defaultTile({ since: "2026-10-01T00:30:00+02:00" }), { label: "" })).toBe(
      "2026-09",
    );
  });
  it("never returns cached source entries after membership revocation", async () => {
    mocks.rpc.mockRejectedValue(new ApiError("Revoked", 403));
    const dashboard = { ...dashboardTemplate("sales"), config: [defaultTile({ visual: "list" })] };
    await expect(dashboardResults(client, "workspace-b", dashboard)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("rejects overlong source pages instead of leaking an unbounded payload", async () => {
    mocks.rpc.mockResolvedValue({ ...entries, data: Array(51).fill(entries.data[0]) });
    const r = await dashboardResults(client, "workspace-a", {
      ...dashboardTemplate("sales"),
      config: [defaultTile({ visual: "list" })],
    });
    expect(r.tiles[0].entries).toBeUndefined();
    expect(r.tiles[0].error).toBeTruthy();
  });
});
