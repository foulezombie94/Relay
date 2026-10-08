import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, checkOrigin, fail } from "@/lib/api/context";
import { workflowBody } from "@/lib/api/workflow-body";
import { emailDraft } from "@/lib/agent/contracts";
import { rpc } from "@/lib/agent/tools";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    checkOrigin(req);
    const { workspace } = await params;
    const { client } = await context(workspace, true);
    const input = emailDraft
      .extend({ idempotency_key: z.uuid() })
      .strict()
      .parse(JSON.parse(await workflowBody(req, 30000)));
    const { idempotency_key, ...draft } = input;
    const proposed = await rpc(client, "agent_action", {
      w: workspace,
      operation: "propose",
      payload: { key: "manual-email:" + idempotency_key, kind: "draft_email", input: draft },
    });
    const action = await rpc(client, "agent_apply", { w: workspace, action_id: proposed.id });
    return NextResponse.json(
      { data: action },
      { status: 202, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
