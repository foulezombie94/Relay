import { describe, it, expect } from "vitest";
import {
  widgetCatalog,
  tileFromPreset,
  tileForVisual,
  filterWidgetCatalog,
  calendarCells,
  entryDate,
  chartTooltipValue,
} from "./dashboard-widgets";
import {
  dashboardVisuals,
  dashboardKinds,
  reportTile,
  defaultTile,
  dashboardSchema,
  dashboardTemplate,
  dashboardCsv,
  type DashboardResult,
} from "./dashboards";
const objects = [
  { id: "00000000-0000-4000-8000-000000000001", slug: "deals" },
  { id: "00000000-0000-4000-8000-000000000002", slug: "people" },
];
describe("dashboard widget catalogue and view boundaries", () => {
  it("keeps exact decimal tooltips when a chart replaces the original value with a number", () => {
    const row = {
      dimension: "qualification",
      label: "Qualification",
      currency: "EUR",
      value: "9007199254740993.125",
      count: 1,
      sample_size: 1,
    };
    expect(
      chartTooltipValue([row], {
        dimension: row.dimension,
        name: row.label,
        value: 9007199254740994,
      }),
    ).toBe(row.value);
    expect(chartTooltipValue([row], { value: 42 })).toBeNull();
    expect(chartTooltipValue([row], null)).toBeNull();
  });
  it.each(widgetCatalog)("creates a valid, saveable $name widget", (preset) => {
    const tile = tileFromPreset(preset, objects);
    expect(reportTile.safeParse(tile).success).toBe(true);
    expect(dashboardSchema.safeParse({ name: "My dashboard", config: [tile] }).success).toBe(true);
    if (tile.kind !== "record") expect(tile.object_id).toBeUndefined();
  });
  it("switches each source to every presentation without invalid dimensions or measures", () => {
    for (const kind of dashboardKinds)
      for (const visual of dashboardVisuals)
        expect(
          reportTile.safeParse(tileForVisual(defaultTile({ kind }), visual)).success,
          kind + " / " + visual,
        ).toBe(true);
  });
  it("binds the contact counter to the people object rather than opportunities", () => {
    const preset = widgetCatalog.find((entry) => entry.id === "contacts")!;
    expect(tileFromPreset(preset, objects).object_id).toBe(objects[1].id);
  });
  it("rejects arbitrary external links and javascript URLs", () => {
    for (const href of [
      "https://example.test",
      "javascript:alert(1)",
      "//example.test",
      "/api/workspaces",
    ])
      expect(
        reportTile.safeParse({
          ...defaultTile({ visual: "links" }),
          links: [{ label: "Open", href }],
        }).success,
      ).toBe(false);
  });
  it("does not allow a record view to imply an aggregate or a different board grouping", () => {
    expect(reportTile.safeParse(defaultTile({ visual: "list", metric: "amount" })).success).toBe(
      false,
    );
    expect(
      reportTile.safeParse(defaultTile({ visual: "board", kind: "email", group_by: "provider" }))
        .success,
    ).toBe(false);
    expect(
      reportTile.safeParse(defaultTile({ visual: "heatmap", group_by: "month" })).success,
    ).toBe(false);
  });
  it("rejects an oversized unicode configuration before PostgreSQL's byte constraint", () => {
    const tile = defaultTile({ visual: "text", content: "界".repeat(1500) });
    expect(dashboardSchema.safeParse({ name: "Notes", config: Array(24).fill(tile) }).success).toBe(
      false,
    );
  });
  it("searches without accents and respects the selected category", () => {
    expect(filterWidgetCatalog("repartition", "metrics").length).toBeGreaterThan(0);
    expect(filterWidgetCatalog("calendrier", "content")).toHaveLength(0);
  });
  it("uses Monday-first UTC calendar rows and handles leap years", () => {
    const cells = calendarCells(2024, 1);
    expect(cells[0].getUTCDay()).toBe(1);
    expect(cells).toHaveLength(35);
    expect(cells.some((cell) => cell.toISOString().startsWith("2024-02-29"))).toBe(true);
    expect(calendarCells(2026, 1)).toHaveLength(35);
  });
  it("keeps unknown dates distinct from Unix epoch and normalizes offsets to UTC", () => {
    const entry = {
      id: "a",
      title: "A",
      record_id: null,
      stage: null,
      status: null,
      currency: null,
      amount: null,
      occurred_at: null,
    };
    expect(entryDate(entry)).toBeNull();
    expect(entryDate({ ...entry, occurred_at: "broken" })).toBeNull();
    expect(entryDate({ ...entry, occurred_at: "2026-10-01T00:30:00+02:00" })?.toISOString()).toBe(
      "2026-09-30T22:30:00.000Z",
    );
  });
  it("exports content as content and protects formulas in paginated source titles", () => {
    const base = dashboardTemplate("management");
    const result: DashboardResult = {
      name: "Dashboard",
      generated_at: "",
      settings: base.settings,
      range: { label: "All" },
      tiles: [
        { tile: defaultTile({ visual: "text", content: "Team notes" }) },
        {
          tile: defaultTile({ visual: "list" }),
          entries: {
            data: [
              {
                id: "a",
                record_id: null,
                title: "=HYPERLINK(1)",
                stage: null,
                status: null,
                occurred_at: null,
                amount: null,
                currency: null,
              },
            ],
            total: 55,
            next_cursor: null,
            partial: true,
          },
        },
      ],
    };
    const csv = dashboardCsv(result);
    expect(csv).toContain("Contenu");
    expect(csv).toContain("Team notes");
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).not.toContain('"Erreur"');
  });
});
