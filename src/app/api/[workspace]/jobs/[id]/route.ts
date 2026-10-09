import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, databaseError, fail } from "@/lib/api/context";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string; id: string }> },
) {
  try {
    const { workspace, id } = await params;
    z.uuid().parse(id);
    const { client } = await context(workspace);
    const { data, error } = await client.rpc("relay_job_status", { w: workspace, job_id: id });
    databaseError(error);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return fail(error);
  }
}
