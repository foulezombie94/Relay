import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, databaseError, fail, ApiError } from "@/lib/api/context";
import { recordColumns } from "@/lib/api/record-query";
import { duplicateGroups } from "@/lib/domain/duplicates";
import { decisionBlocks } from "@/lib/domain/duplicate-pairs";
import type { CrmRecord, Attribute } from "@/lib/domain/types";
import type { DuplicateDecision } from "@/lib/domain/duplicate-pairs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    const { workspace } = await params;
    const { client } = await context(workspace);
    const a = z.uuid().parse(request.nextUrl.searchParams.get("a")),
      b = z.uuid().parse(request.nextUrl.searchParams.get("b"));
    if (a === b) throw new ApiError("Deux fiches différentes sont requises.");
    const { data, error } = await client
      .from("records")
      .select(recordColumns)
      .eq("workspace_id", workspace)
      .in("id", [a, b])
      .eq("archived", false);
    databaseError(error);
    const first = data?.find((r) => r.id === a) as CrmRecord | undefined,
      second = data?.find((r) => r.id === b) as CrmRecord | undefined;
    if (!first || !second || first.object_id !== second.object_id)
      throw new ApiError(
        "Une fiche a été archivée, fusionnée ou n’est plus accessible.",
        404,
      );
    const ids = [a, b].sort();
    const [attrs, decision] = await Promise.all([
      client
        .from("attributes")
        .select("*")
        .eq("workspace_id", workspace)
        .eq("object_id", first.object_id)
        .order("id"),
      client
        .from("duplicate_decisions")
        .select("*")
        .eq("workspace_id", workspace)
        .eq("record_a", ids[0])
        .eq("record_b", ids[1])
        .maybeSingle(),
    ]);
    databaseError(attrs.error);
    databaseError(decision.error);
    const matches = duplicateGroups([first, second]);
    return NextResponse.json(
      {
        a: first,
        b: second,
        attributes: (attrs.data ?? []) as Attribute[],
        reasons: matches.map((g) => g.reason),
        is_candidate:
          matches.length > 0 &&
          !decisionBlocks(
            decision.data as DuplicateDecision | undefined,
            Date.now(),
          ),
        decision: decision.data,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
