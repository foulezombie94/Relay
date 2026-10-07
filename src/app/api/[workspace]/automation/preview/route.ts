import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, checkOrigin, databaseError, ApiError, fail } from "@/lib/api/context";
import { workflowBody } from "@/lib/api/workflow-body";
import { workflowDefinition } from "@/lib/domain/workflow-schema";
import { recordValues, renderWorkflowText } from "@/lib/domain/workflow-variables";
import type { CrmRecord, WorkflowAction } from "@/lib/domain/types";
import { matches } from "@/lib/domain/workflows";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    checkOrigin(req);
    const { workspace } = await params;
    const { client } = await context(workspace, true);
    const input = z
      .object({ record_id: z.uuid(), definition: workflowDefinition, action_id: z.uuid() })
      .strict()
      .parse(JSON.parse(await workflowBody(req, 70000)));
    const { data: r, error } = await client
      .from("records")
      .select("*")
      .eq("workspace_id", workspace)
      .eq("object_id", input.definition.object_id)
      .eq("id", input.record_id)
      .eq("archived", false)
      .single();
    databaseError(error);
    if (!r) throw new ApiError("Fiche inaccessible.", 403);
    const actions = input.definition.actions.flatMap((a) =>
        a.type === "branch" ? [a, ...a.then, ...a.otherwise] : [a],
      ),
      action = actions.find((a) => a.id === input.action_id);
    if (!action) throw new ApiError("Bloc introuvable.");
    const { data: relations, error: relError } = await client
      .from("record_relations")
      .select("source_id,target_id")
      .eq("workspace_id", workspace)
      .or(`source_id.eq.${r.id},target_id.eq.${r.id}`)
      .limit(50);
    databaseError(relError);
    const ids = (relations ?? []).map((x) => (x.source_id === r.id ? x.target_id : x.source_id));
    const linked = ids.length
      ? await client
          .from("records")
          .select("*")
          .eq("workspace_id", workspace)
          .in("id", ids)
          .eq("archived", false)
          .order("id")
      : { data: [], error: null };
    databaseError(linked.error);
    const { data: objects, error: objectError } = await client
      .from("objects")
      .select("id,slug")
      .eq("workspace_id", workspace);
    databaseError(objectError);
    const extra: Record<string, unknown> = {};
    for (const [slug, key] of [
      ["people", "contact"],
      ["companies", "company"],
      ["deals", "deal"],
    ]) {
      const object = objects?.find((o) => o.slug === slug),
        row = r.object_id === object?.id ? r : linked.data?.find((x) => x.object_id === object?.id);
      if (row) extra[key] = recordValues(row)[key];
    }
    const values = recordValues(r, extra),
      rendered: Record<string, string> = {},
      unavailable: string[] = [];
    for (const key of [
      "title",
      "body",
      "subject",
      "to",
      "value",
      "starts_at",
      "input",
      "until",
    ] as const) {
      const raw = (action as WorkflowAction)[key];
      if (typeof raw !== "string") continue;
      try {
        rendered[key] = renderWorkflowText(raw, values);
      } catch {
        unavailable.push(key);
      }
    }
    return NextResponse.json(
      {
        data: {
          rendered,
          unavailable,
          condition: action.conditions?.some(
            (condition) =>
              condition.field.startsWith("steps.") || condition.field.startsWith("event."),
          )
            ? null
            : action.conditions
              ? matches(r as CrmRecord, action.conditions, action.condition_mode)
              : null,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return fail(error);
  }
}
