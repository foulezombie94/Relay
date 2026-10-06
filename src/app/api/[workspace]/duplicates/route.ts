import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  context,
  checkOrigin,
  fail,
  ApiError,
  requireAdmin,
  databaseError,
} from "@/lib/api/context";
import { collect } from "@/lib/api/collect";
import { duplicateGroups, mergeValues } from "@/lib/domain/duplicates";
import {
  findDuplicatePairs,
  type DuplicateDecision,
} from "@/lib/domain/duplicate-pairs";
import { mergeError as checkMergeError } from "@/lib/api/merge-errors";
import { validateAttributes } from "@/lib/domain/attributes";
import type { Attribute, CrmRecord } from "@/lib/domain/types";
import { recordColumns } from "@/lib/api/record-query";
type Params = { params: Promise<{ workspace: string }> };
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { workspace } = await params;
    const { client } = await context(workspace);
    const objectId = request.nextUrl.searchParams.get("object_id");
    if (objectId) z.uuid().parse(objectId);
    const records = (await collect(
      client,
      workspace,
      "records",
      recordColumns,
      objectId ? { object_id: objectId } : {},
    )) as CrmRecord[];
    const decisions = await collect(client, workspace, "duplicate_decisions");
    const result = findDuplicatePairs(
      records,
      decisions as unknown as DuplicateDecision[],
    );
    return NextResponse.json(
      {
        data: result.pairs,
        total: records.length,
        truncated: result.truncated,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: NextRequest, { params }: Params) {
  try {
    checkOrigin(request);
    const { workspace } = await params;
    const { client, role } = await context(workspace, true);
    requireAdmin(role);
    const body = z
      .object({
        source: z.uuid(),
        target: z.uuid(),
        source_version: z.number().int().positive(),
        target_version: z.number().int().positive(),
        choices: z.record(
          z
            .string()
            .regex(
              /^(display_name|email|domain|stage|amount|currency|owner_id|close_date|attr:[a-z][a-z0-9_]{0,49})$/,
            ),
          z.enum(["source", "target"]),
        ),
      })
      .parse(await request.json());
    if (body.source === body.target)
      throw new ApiError("Choisissez deux fiches différentes.");
    const { data, error } = await client
      .from("records")
      .select(recordColumns)
      .eq("workspace_id", workspace)
      .in("id", [body.source, body.target]);
    databaseError(error);
    const source = data?.find((r) => r.id === body.source) as
        CrmRecord | undefined,
      target = data?.find((r) => r.id === body.target) as CrmRecord | undefined;
    if (
      !source ||
      !target ||
      source.archived ||
      target.archived ||
      source.object_id !== target.object_id
    )
      throw new ApiError("Fiches incompatibles.", 400);
    if (
      source.version !== body.source_version ||
      target.version !== body.target_version
    )
      throw new ApiError(
        "Les fiches ont changé. Fermez puis rechargez l’aperçu.",
        409,
      );
    if (!duplicateGroups([source, target]).length)
      throw new ApiError(
        "La comparaison recalculée ne détecte plus de doublon potentiel. Modifiez ou gardez les fiches séparées.",
        409,
      );
    const { data: attrs, error: ae } = await client
      .from("attributes")
      .select("*")
      .eq("workspace_id", workspace)
      .eq("object_id", source.object_id);
    databaseError(ae);
    if (
      source.currency !== target.currency &&
      (body.choices.amount ?? "target") !== (body.choices.currency ?? "target")
    )
      throw new ApiError(
        "Le montant et sa devise doivent provenir de la même fiche.",
      );
    const values = mergeValues(source, target, body.choices);
    const active = (attrs ?? []) as Attribute[];
    const problems = validateAttributes(
      Object.fromEntries(
        Object.entries(values.attributes as Record<string, unknown>).filter(
          ([key]) => active.some((a) => a.key === key && !a.archived),
        ),
      ),
      active,
    );
    if (problems.length) throw new ApiError(problems.join(" "));
    const { data: result, error: mergeError } = await client.rpc(
      "merge_records",
      {
        w: workspace,
        src: body.source,
        dst: body.target,
        sv: body.source_version,
        tv: body.target_version,
        picks: body.choices,
      },
    );
    checkMergeError(mergeError);
    return NextResponse.json({ data: result });
  } catch (e) {
    return fail(e);
  }
}
