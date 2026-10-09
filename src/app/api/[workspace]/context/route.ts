import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, fail } from "@/lib/api/context";
import { rpc } from "@/lib/agent/tools";
type Params = { params: Promise<{ workspace: string }> };
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { workspace } = await params;
    const { client } = await context(workspace);
    const record = z.uuid().parse(request.nextUrl.searchParams.get("record_id"));
    const view = z
      .enum(["summary", "timeline", "relations", "all"])
      .parse(request.nextUrl.searchParams.get("view") || "all");
    const data = await rpc(client, "crm_record_context", { w: workspace, record, view });
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return fail(e);
  }
}
