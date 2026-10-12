import { mcpOrigin } from "@/lib/mcp/config";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, checkOrigin, databaseError, fail, ApiError } from "@/lib/api/context";
import { boundedJsonBody } from "@/lib/api/workflow-body";
import { actionSchemas } from "@/lib/agent/contracts";
import { validateAttributes } from "@/lib/domain/attributes";
import type { Attribute } from "@/lib/domain/types";
type P = { params: Promise<{ workspace: string }> };
const headers = { "Cache-Control": "private, no-store" };
export async function GET(_: NextRequest, { params }: P) {
  try {
    const { workspace } = await params;
    const { client } = await context(workspace);
    const { data, error } = await client.rpc("mcp_manage", { w: workspace, operation: "list" });
    databaseError(error);
    return NextResponse.json({ data, origin: mcpOrigin() }, { headers });
  } catch (e) {
    const r = fail(e);
    r.headers.set("Cache-Control", "no-store");
    return r;
  }
}
export async function POST(req: NextRequest, { params }: P) {
  try {
    // A human browser action is required; a model's MCP credential cannot
    // approve its own request and there is no MCP approve tool.
    if (!req.headers.get("origin")) throw new ApiError("Origine requise.", 403);
    checkOrigin(req);
    const { workspace } = await params;
    const body = z
      .object({ operation: z.enum(["approve", "reject", "revoke"]), id: z.uuid() })
      .strict()
      .parse(await boundedJsonBody(req, 4000));
    const { client } = await context(workspace, body.operation === "approve");
    if (body.operation === "approve") {
      const snapshot = await client.rpc("mcp_manage", { w: workspace, operation: "list" });
      databaseError(snapshot.error);
      const command = (
        snapshot.data.commands as Array<{
          id: string;
          action: keyof typeof actionSchemas;
          values: unknown;
          status: string;
        }>
      ).find((c) => c.id === body.id);
      if (
        !command ||
        ![
          "create_record",
          "update_record",
          "create_task",
          "update_task",
          "create_note",
          "update_note",
        ].includes(command.action)
      )
        throw new ApiError("Action inaccessible.", 404);
      const values =
        command.status === "pending"
          ? (actionSchemas[command.action].parse(command.values) as Record<string, unknown>)
          : {};
      if (
        command.status === "pending" &&
        (command.action === "create_record" || command.action === "update_record")
      ) {
        const previous =
          command.action === "update_record"
            ? await client
                .from("records")
                .select("object_id,attributes")
                .eq("workspace_id", workspace)
                .eq("id", values.id)
                .maybeSingle()
            : null;
        if (previous) {
          databaseError(previous.error);
          if (!previous.data) throw new ApiError("Fiche inaccessible.", 404);
        }
        const attributes = await client
          .from("attributes")
          .select("*")
          .eq("workspace_id", workspace)
          .eq("object_id", previous?.data?.object_id ?? values.object_id);
        databaseError(attributes.error);
        const candidate =
          command.action === "update_record"
            ? ((values.values as Record<string, unknown>).attributes ?? previous?.data?.attributes)
            : (values.attributes ?? {});
        const issues = validateAttributes(
          candidate as Record<string, unknown>,
          attributes.data as Attribute[],
          previous?.data?.attributes,
        );
        if (issues.length) throw new ApiError(issues.join(" "));
      }
    }
    const { data, error } = await client.rpc("mcp_manage", {
      w: workspace,
      operation: body.operation,
      cid: body.id,
    });
    databaseError(error);
    return NextResponse.json({ data }, { headers });
  } catch (e) {
    const r = fail(e);
    r.headers.set("Cache-Control", "no-store");
    return r;
  }
}
