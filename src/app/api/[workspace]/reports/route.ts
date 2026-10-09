import { NextRequest, NextResponse } from "next/server";
import { context, fail } from "@/lib/api/context";
import { rpc } from "@/lib/agent/tools";
import { z } from "zod";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    const { workspace } = await params;
    const { client, user } = await context(workspace);
    const pipeline = req.nextUrl.searchParams.get("pipeline");
    const owner = req.nextUrl.searchParams.get("owner");
    const month = z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .parse(req.nextUrl.searchParams.get("month") || new Date().toISOString().slice(0, 7));
    const data = await rpc(client, "crm_sales_report", {
      w: workspace,
      pipeline_filter: pipeline ? z.uuid().parse(pipeline) : null,
      owner_filter: owner === "me" ? user.id : owner ? z.uuid().parse(owner) : null,
      report_month: month,
    });
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return fail(e);
  }
}
