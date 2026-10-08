import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, checkOrigin, fail, databaseError } from "@/lib/api/context";
import { rpc } from "@/lib/agent/tools";
const schema = z
  .object({ dashboard_id: z.uuid(), operation: z.enum(["favorite", "home"]), enabled: z.boolean() })
  .strict();
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    const { workspace } = await params,
      { client, user } = await context(workspace);
    const result = await client
      .from("dashboard_preferences")
      .select("dashboard_id,favorite,home")
      .eq("workspace_id", workspace)
      .eq("user_id", user.id);
    databaseError(result.error);
    return NextResponse.json(
      { data: result.data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    checkOrigin(req);
    const { workspace } = await params,
      { client } = await context(workspace);
    const body = schema.parse(await req.json());
    await rpc(client, "dashboard_preference", {
      w: workspace,
      d: body.dashboard_id,
      operation: body.operation,
      enabled: body.enabled,
    });
    return NextResponse.json({ data: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return fail(e);
  }
}
