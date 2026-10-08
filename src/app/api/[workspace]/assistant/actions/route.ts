import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, checkOrigin, fail } from "@/lib/api/context";
import { workflowBody } from "@/lib/api/workflow-body";
import { rpc } from "@/lib/agent/tools";
import { actionSchemas, type AgentAction } from "@/lib/agent/contracts";
import { validateAttributes } from "@/lib/domain/attributes";
import type { Attribute } from "@/lib/domain/types";
import { ApiError, databaseError } from "@/lib/api/context";
type P = { params: Promise<{ workspace: string }> };
export async function GET(req: NextRequest, { params }: P) {
  try {
    const { workspace } = await params;
    const { client } = await context(workspace);
    const id = z.uuid().parse(req.nextUrl.searchParams.get("id"));
    return NextResponse.json(
      {
        data: await rpc(client, "agent_action", {
          w: workspace,
          operation: "get",
          payload: { id },
        }),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: NextRequest, { params }: P) {
  try {
    checkOrigin(req);
    const { workspace } = await params;
    const { client } = await context(workspace, true);
    const { id, operation } = z
      .object({ id: z.uuid(), operation: z.enum(["confirm", "cancel"]) })
      .strict()
      .parse(JSON.parse(await workflowBody(req, 2000)));
    if (operation === "cancel")
      return NextResponse.json({
        data: await rpc(client, "agent_action", {
          w: workspace,
          operation: "cancel",
          payload: { id },
        }),
      });
    const a = (await rpc(client, "agent_action", {
      w: workspace,
      operation: "get",
      payload: { id },
    })) as AgentAction;
    actionSchemas[a.kind].parse(a.input);
    if (a.kind === "create_record" || a.kind === "update_record") {
      const previous =
        a.kind === "update_record"
          ? await client
              .from("records")
              .select("object_id,attributes")
              .eq("workspace_id", workspace)
              .eq("id", String(a.input.id))
              .maybeSingle()
          : null;
      if (previous) {
        databaseError(previous.error);
        if (!previous.data) throw new ApiError("Fiche inaccessible.", 403);
      }
      const object = previous?.data?.object_id ?? a.input.object_id;
      const definitions = await client
        .from("attributes")
        .select("*")
        .eq("workspace_id", workspace)
        .eq("object_id", object);
      databaseError(definitions.error);
      const values = (a.input.values ?? a.input) as Record<string, unknown>;
      const issues = validateAttributes(
        (values.attributes ?? previous?.data?.attributes ?? {}) as Record<string, unknown>,
        definitions.data as Attribute[],
        previous?.data?.attributes,
      );
      if (issues.length) throw new ApiError(issues.join(" "));
    }
    return NextResponse.json({
      data: await rpc(client, "agent_apply", { w: workspace, action_id: id }),
    });
  } catch (e) {
    return fail(e);
  }
}
