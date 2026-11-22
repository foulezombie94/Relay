import { mcpOrigin } from "@/lib/mcp/config";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  context,
  checkOrigin,
  databaseError,
  fail,
  ApiError,
  requireAdmin,
} from "@/lib/api/context";
import { mergeProposal, attributeProposal, pipelineProposal } from "@/lib/mcp/contracts";
import { boundedJsonBody } from "@/lib/api/workflow-body";
import { actionSchemas } from "@/lib/agent/contracts";
import { validateAttributes } from "@/lib/domain/attributes";
import type { Attribute } from "@/lib/domain/types";
type P = { params: Promise<{ workspace: string }> };
// Values are revalidated before approval with the same schemas as the in-app flows.
const proposalSchemas: Record<string, z.ZodType> = {
  create_record: actionSchemas.create_record,
  update_record: actionSchemas.update_record,
  create_task: actionSchemas.create_task,
  update_task: actionSchemas.update_task,
  create_note: actionSchemas.create_note,
  update_note: actionSchemas.update_note,
  update_commitment: actionSchemas.update_commitment,
  create_workflow_draft: actionSchemas.create_workflow_draft,
  update_workflow_draft: actionSchemas.update_workflow_draft,
  add_to_list: actionSchemas.add_to_list,
  remove_from_list: actionSchemas.remove_from_list,
  merge_records: mergeProposal,
  create_attribute: attributeProposal,
  save_pipeline_stages: pipelineProposal,
};
const adminActions = new Set(["merge_records", "create_attribute", "save_pipeline_stages"]);
/** Same safety checks as the duplicates screen before a merge is executed. */
async function validateMerge(
  client: Awaited<ReturnType<typeof context>>["client"],
  workspace: string,
  values: Record<string, unknown>,
) {
  const { data, error } = await client
    .from("records")
    .select("id,object_id,archived,version,currency")
    .eq("workspace_id", workspace)
    .in("id", [values.source_id as string, values.target_id as string]);
  databaseError(error);
  const source = data?.find((r) => r.id === values.source_id);
  const target = data?.find((r) => r.id === values.target_id);
  if (
    !source ||
    !target ||
    source.archived ||
    target.archived ||
    source.object_id !== target.object_id
  )
    throw new ApiError("Fiches incompatibles.", 400);
  if (source.version !== values.source_version || target.version !== values.target_version)
    throw new ApiError("Les fiches ont changé. Demandez une nouvelle proposition.", 409);
  const choices = (values.choices ?? {}) as Record<string, string>;
  if (
    source.currency !== target.currency &&
    (choices.amount ?? "target") !== (choices.currency ?? "target")
  )
    throw new ApiError("Le montant et sa devise doivent provenir de la même fiche.");
}
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
    const { client, role } = await context(workspace, body.operation === "approve");
    if (body.operation === "approve") {
      const snapshot = await client.rpc("mcp_manage", { w: workspace, operation: "list" });
      databaseError(snapshot.error);
      const command = (
        snapshot.data.commands as Array<{
          id: string;
          action: string;
          values: unknown;
          status: string;
        }>
      ).find((c) => c.id === body.id);
      if (!command || !(command.action in proposalSchemas))
        throw new ApiError("Action inaccessible.", 404);
      if (command.status === "pending" && adminActions.has(command.action)) requireAdmin(role);
      const values =
        command.status === "pending"
          ? (proposalSchemas[command.action].parse(command.values) as Record<string, unknown>)
          : {};
      if (command.status === "pending" && command.action === "merge_records")
        await validateMerge(client, workspace, values);
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
