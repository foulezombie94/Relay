import { NextRequest, NextResponse } from "next/server";
import { context, fail } from "@/lib/api/context";
import { collect } from "@/lib/api/collect";
import { rankPriorities } from "@/lib/domain/priorities";
import type { CrmRecord } from "@/lib/domain/types";
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    const { workspace } = await params;
    const { client } = await context(workspace);
    const [records, tasks, commitments, conflicts, activities, meetings] =
      await Promise.all([
        collect(
          client,
          workspace,
          "records",
          "id,workspace_id,object_id,display_name,email,domain,stage,amount,currency,owner_id,attributes,archived,version,close_date,created_at,updated_at",
        ),
        collect(client, workspace, "tasks"),
        collect(client, workspace, "commitments"),
        collect(client, workspace, "conflicts"),
        collect(client, workspace, "activities"),
        collect(
          client,
          workspace,
          "meetings",
          "id,workspace_id,record_id,starts_at,created_at",
        ),
      ]);
    const generated_at = new Date().toISOString();
    const all = rankPriorities(
      records as CrmRecord[],
      tasks,
      commitments,
      conflicts,
      activities,
      meetings,
      new Date(generated_at),
    );
    return NextResponse.json({
      data: all.filter((p) => p.score > 0),
      generated_at,
      total: all.length,
      without_next_action: all.filter((p) =>
        p.signals.some((s) => s.code === "next_step"),
      ).length,
    });
  } catch (e) {
    return fail(e);
  }
}
