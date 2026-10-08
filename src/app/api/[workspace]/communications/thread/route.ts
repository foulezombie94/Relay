import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, checkOrigin, fail } from "@/lib/api/context";
import { rpc } from "@/lib/agent/tools";
import { hydrateEmail } from "@/lib/integrations/email-content";
import { workflowBody } from "@/lib/api/workflow-body";
type P = { params: Promise<{ workspace: string }> };
export async function GET(req: NextRequest, { params }: P) {
  try {
    const { workspace } = await params;
    const { client } = await context(workspace);
    const id = z.uuid().parse(req.nextUrl.searchParams.get("id"));
    const cursor = req.nextUrl.searchParams.get("cursor");
    const data = await rpc(client, "agent_search", {
      w: workspace,
      kind: "thread",
      source: id,
      filters: { limit: 20, ...(cursor ? { cursor: z.uuid().parse(cursor) } : {}) },
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: NextRequest, { params }: P) {
  try {
    checkOrigin(req);
    const { workspace } = await params;
    const { client } = await context(workspace, true);
    const { id } = z
      .object({ id: z.uuid() })
      .strict()
      .parse(JSON.parse(await workflowBody(req, 1000)));
    return NextResponse.json(
      { data: await hydrateEmail(client, workspace, id) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
