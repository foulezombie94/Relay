import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, fail, databaseError, ApiError } from "@/lib/api/context";
import { dashboardSchema } from "@/lib/domain/dashboards";
import { rpc } from "@/lib/agent/tools";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    const { workspace } = await params;
    const { client } = await context(workspace);
    const id = z.uuid().parse(req.nextUrl.searchParams.get("id"));
    const r = await client
      .from("report_dashboards")
      .select("name,config,visibility")
      .eq("workspace_id", workspace)
      .eq("id", id)
      .maybeSingle();
    databaseError(r.error);
    if (!r.data) throw new ApiError("Dashboard inaccessible.", 403);
    const dashboard = dashboardSchema.parse(r.data),
      tiles = [];
    for (const tile of dashboard.config) {
      const { title, metric, visual, kind, group_by, ...filters } = tile;
      tiles.push({
        title,
        metric,
        visual,
        ...(await rpc(client, "agent_aggregate", { w: workspace, kind, group_by, filters })),
      });
    }
    return NextResponse.json(
      { data: { name: dashboard.name, tiles } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
