import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, checkOrigin, databaseError, fail, ApiError } from "@/lib/api/context";
import { boundedJsonBody } from "@/lib/api/workflow-body";
type P = { params: Promise<{ workspace: string; id: string }> };
export async function PUT(req: NextRequest, { params }: P) {
  try {
    checkOrigin(req);
    const { workspace, id } = await params;
    z.uuid().parse(id);
    const { client, user } = await context(workspace);
    const { favorite } = z
      .object({ favorite: z.boolean() })
      .strict()
      .parse(await boundedJsonBody(req, 1000));
    const { data: meeting, error: readError } = await client
      .from("meetings")
      .select("id")
      .eq("workspace_id", workspace)
      .eq("id", id)
      .maybeSingle();
    databaseError(readError);
    if (!meeting) throw new ApiError("Réunion inaccessible.", 404);
    const { error } = favorite
      ? await client
          .from("meeting_favorites")
          .upsert(
            { workspace_id: workspace, user_id: user.id, meeting_id: id },
            { onConflict: "workspace_id,user_id,meeting_id", ignoreDuplicates: true },
          )
      : await client
          .from("meeting_favorites")
          .delete()
          .eq("workspace_id", workspace)
          .eq("user_id", user.id)
          .eq("meeting_id", id);
    databaseError(error);
    return NextResponse.json({ ok: true, id, favorite });
  } catch (error) {
    return fail(error);
  }
}
