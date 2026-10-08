import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, fail, checkOrigin, ApiError } from "@/lib/api/context";
import { dashboardSchema, dashboardSettings, dashboardCsv } from "@/lib/domain/dashboards";
import { readDashboard, dashboardResults, dashboardDetails } from "@/lib/api/dashboards";

const detail = z
  .object({
    index: z.number().int().min(0).max(23),
    dimension: z.string().max(100).nullable().default(null),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .default(null),
    cursor: z.uuid().nullable().default(null),
  })
  .strict();
const preview = z
  .object({
    dashboard: dashboardSchema,
    settings: dashboardSettings.optional(),
    detail: detail.optional(),
  })
  .strict();
const headers = { "Cache-Control": "private, no-store" };
function json(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new ApiError("JSON invalide.", 400);
  }
}
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    const { workspace } = await params,
      { client } = await context(workspace),
      p = req.nextUrl.searchParams;
    const id = p.get("id") ? z.uuid().parse(p.get("id")) : undefined;
    const template = z
      .enum(["sales", "activity", "management"])
      .parse(p.get("template") ?? "management");
    if ((p.get("settings")?.length ?? 0) > 4000) throw new ApiError("Filtres trop volumineux.");
    const settings = p.has("settings")
      ? dashboardSettings.parse(json(p.get("settings")!))
      : undefined;
    const dashboard = await readDashboard(client, workspace, id, template);
    if (p.has("index")) {
      const scope = detail.parse({
        index: Number(p.get("index")),
        dimension: p.get("dimension"),
        currency: p.get("currency"),
        cursor: p.get("cursor"),
      });
      return NextResponse.json(
        {
          data: await dashboardDetails(
            client,
            workspace,
            dashboard,
            settings ?? dashboard.settings,
            scope.index,
            scope.dimension,
            scope.currency,
            scope.cursor,
          ),
        },
        { headers },
      );
    }
    const data = await dashboardResults(client, workspace, dashboard, settings);
    if (p.get("format") === "csv")
      return new NextResponse(dashboardCsv(data), {
        headers: {
          ...headers,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="relay-dashboard.csv"',
          "X-Content-Type-Options": "nosniff",
        },
      });
    return NextResponse.json({ data }, { headers });
  } catch (e) {
    return fail(e);
  }
}
// A preview is read-only and uses the same current user client as a saved
// dashboard. Passing a configuration never grants access to its sources.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    checkOrigin(req);
    const { workspace } = await params,
      { client } = await context(workspace);
    const body = await req.text();
    if (Buffer.byteLength(body) > 64000) throw new ApiError("Configuration trop volumineuse.", 413);
    const parsed = preview.parse(json(body)),
      settings = parsed.settings ?? parsed.dashboard.settings;
    const data = parsed.detail
      ? await dashboardDetails(
          client,
          workspace,
          parsed.dashboard,
          settings,
          parsed.detail.index,
          parsed.detail.dimension,
          parsed.detail.currency,
          parsed.detail.cursor,
        )
      : await dashboardResults(client, workspace, parsed.dashboard, parsed.settings);
    return NextResponse.json({ data }, { headers });
  } catch (e) {
    return fail(e);
  }
}
