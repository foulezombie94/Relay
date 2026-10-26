import { describe, it, expect } from "vitest";
import {
  dashboardTemplate,
  dashboardSchema,
  reportTile,
  defaultTile,
  dashboardSettings,
  resolveDashboardPeriod,
  tileFilters,
  moveTile,
  formatDashboardValue,
  dashboardCsv,
  type DashboardResult,
} from "./dashboards";
describe("customizable dashboards", () => {
  it.each(["sales", "activity", "management"] as const)("validates the %s template", (t) => {
    expect(dashboardSchema.safeParse(dashboardTemplate(t)).success).toBe(true);
  });
  it("keeps legacy dashboards compatible", () => {
    const d = dashboardSchema.parse({
      name: "Old",
      config: [
        { title: "Count", kind: "record", group_by: "none", metric: "count", visual: "table" },
      ],
    });
    expect(d.settings.period).toBe("all");
    expect(d.visibility).toBe("private");
  });
  it("composes the overview as four half-width widgets bound to the correct sources", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const overview = dashboardTemplate("management", id);
    expect(overview.config.map((tile) => [tile.visual, tile.kind, tile.size])).toEqual([
      ["table", "record", "medium"],
      ["gallery", "record", "medium"],
      ["list", "task", "medium"],
      ["timeline", "email", "medium"],
    ]);
    expect(overview.config.slice(0, 2).every((tile) => tile.object_id === id)).toBe(true);
    expect(overview.config.slice(2).every((tile) => tile.object_id === undefined)).toBe(true);
  });
  it("rejects invalid source metrics and injected properties", () => {
    expect(reportTile.safeParse(defaultTile({ kind: "email", metric: "amount" })).success).toBe(
      false,
    );
    expect(reportTile.safeParse({ ...defaultTile(), sql: "select *" }).success).toBe(false);
  });
  it("bounds dashboards to 24 widgets and validates unique identities", () => {
    const d = dashboardTemplate("sales");
    expect(dashboardSchema.safeParse({ ...d, config: Array(25).fill(defaultTile()) }).success).toBe(
      false,
    );
    const t = defaultTile({ id: "00000000-0000-4000-8000-000000000001" });
    expect(dashboardSchema.safeParse({ ...d, config: [t, t] }).success).toBe(false);
  });
  it("requires monetary goals to specify one currency", () => {
    expect(
      reportTile.safeParse(defaultTile({ metric: "amount", visual: "goal", goal: 100 })).success,
    ).toBe(false);
    expect(
      reportTile.safeParse(
        defaultTile({ metric: "amount", visual: "goal", goal: 100, goal_currency: "EUR" }),
      ).success,
    ).toBe(true);
  });
  it("requires temporal dimensions for lines and totals for KPIs", () => {
    expect(reportTile.safeParse(defaultTile({ visual: "line", group_by: "owner" })).success).toBe(
      false,
    );
    expect(reportTile.safeParse(defaultTile({ group_by: "stage" })).success).toBe(false);
  });
  it("validates real calendar dates and ordered custom intervals", () => {
    expect(
      dashboardSettings.safeParse({ period: "custom", since: "2026-02-30", until: "2026-03-01" })
        .success,
    ).toBe(false);
    expect(
      dashboardSettings.safeParse({ period: "custom", since: "2026-04-01", until: "2026-03-01" })
        .success,
    ).toBe(false);
  });
  it("includes the last custom day and compares equal durations in UTC", () => {
    const s = dashboardSettings.parse({
      period: "custom",
      since: "2026-03-01",
      until: "2026-03-02",
    });
    const r = resolveDashboardPeriod(s);
    expect(r.until).toBe("2026-03-03T00:00:00.000Z");
    expect(Date.parse(r.until!) - Date.parse(r.since!)).toBe(
      Date.parse(r.previous!.until) - Date.parse(r.previous!.since),
    );
  });
  it("uses the full prior calendar month", () => {
    const r = resolveDashboardPeriod(
      dashboardSettings.parse({ period: "last_month" }),
      new Date("2026-03-08T12:00:00Z"),
    );
    expect(r.since).toBe("2026-02-01T00:00:00.000Z");
    expect(r.until).toBe("2026-03-01T00:00:00.000Z");
  });
  it("intersects widget filters with dashboard filters", () => {
    const a = "00000000-0000-4000-8000-000000000001",
      b = "00000000-0000-4000-8000-000000000002";
    const f = tileFilters(
      defaultTile({ pipeline_id: a }),
      dashboardSettings.parse({ pipeline_id: b }),
      {},
    );
    expect(f.empty).toBe(true);
  });
  it("does not mix monetary goals with another global currency", () => {
    const f = tileFilters(
      defaultTile({ metric: "amount", visual: "goal", goal: 100, goal_currency: "EUR" }),
      dashboardSettings.parse({ currency: "USD" }),
      {},
    );
    expect(f.empty).toBe(true);
    expect(f.currency).toBe("EUR");
  });
  it("ignores inapplicable CRM owner filters for emails", () => {
    expect(
      tileFilters(
        defaultTile({ kind: "email" }),
        dashboardSettings.parse({ owner_id: "00000000-0000-4000-8000-000000000001" }),
        {},
      ),
    ).not.toHaveProperty("owner_id");
  });
  it("reorders without mutating the source array", () => {
    const a = [1, 2, 3];
    expect(moveTile(a, 0, 2)).toEqual([2, 3, 1]);
    expect(a).toEqual([1, 2, 3]);
    expect(moveTile(a, -1, 2)).toBe(a);
  });
  it("preserves large exact numeric labels and unknown ratios", () => {
    expect(
      formatDashboardValue("9007199254740993.125", "amount", "EUR").replaceAll("\u202f", ""),
    ).toBe("9007199254740993,13 EUR");
    expect(formatDashboardValue(null, "win_rate")).toBe("—");
    expect(formatDashboardValue("33.33333", "win_rate")).toBe("33,33 %");
  });
  it("escapes exported formulas including leading whitespace", () => {
    const d = dashboardTemplate("sales");
    const r = {
      name: ' =HYPERLINK("evil")',
      tiles: [
        {
          tile: d.config[0],
          current: {
            data: [
              {
                dimension: null,
                label: "\n@SUM(1)",
                currency: "EUR",
                count: 1,
                sample_size: 1,
                value: "9007199254740993.12",
              },
            ],
            totals: [],
            total: 1,
            partial: false,
            missing_history: 0,
            coverage: "Exact",
          },
        },
      ],
      range: { label: "All" },
      settings: d.settings,
      generated_at: "2026-10-08",
    } satisfies DashboardResult;
    const csv = dashboardCsv(r);
    expect(csv).toContain("\"' =HYPERLINK");
    expect(csv).toContain("\"'\n@SUM");
    expect(csv).toContain("9007199254740993.12");
  });
});
