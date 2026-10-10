import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, checkOrigin, ApiError, databaseError, fail } from "@/lib/api/context";
import { boundedJsonBody } from "@/lib/api/workflow-body";
type P = { params: Promise<{ workspace: string; id: string }> };
async function meetingContext(params: P["params"], write = false) {
  const { workspace, id } = await params;
  z.uuid().parse(id);
  const c = await context(workspace, write);
  const { data, error } = await c.client
    .from("meetings")
    .select("id,record_id")
    .eq("workspace_id", workspace)
    .eq("id", id)
    .maybeSingle();
  databaseError(error);
  if (!data) throw new ApiError("Réunion inaccessible.", 404);
  return { ...c, workspace, id, meeting: data };
}
export async function GET(_req: NextRequest, { params }: P) {
  try {
    const { client, workspace, id, meeting } = await meetingContext(params);
    const { data, error } = await client
      .from("meeting_record_links")
      .select("record_id")
      .eq("workspace_id", workspace)
      .eq("meeting_id", id)
      .limit(100);
    databaseError(error);
    const ids = [
      ...new Set([meeting.record_id, ...(data ?? []).map((l) => l.record_id)].filter(Boolean)),
    ];
    if (!ids.length)
      return NextResponse.json({ data: [] }, { headers: { "Cache-Control": "private, no-store" } });
    const { data: records, error: recordError } = await client
      .from("records")
      .select("id,workspace_id,object_id,display_name")
      .eq("workspace_id", workspace)
      .in("id", ids);
    databaseError(recordError);
    return NextResponse.json(
      { data: (records ?? []).map((r) => ({ ...r, primary: r.id === meeting.record_id })) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return fail(error);
  }
}
export async function POST(req: NextRequest, { params }: P) {
  try {
    checkOrigin(req);
    const { client, workspace, id } = await meetingContext(params, true);
    const { record_id } = z
      .object({ record_id: z.uuid() })
      .strict()
      .parse(await boundedJsonBody(req, 1000));
    const { data: record, error: readError } = await client
      .from("records")
      .select("id")
      .eq("workspace_id", workspace)
      .eq("id", record_id)
      .maybeSingle();
    databaseError(readError);
    if (!record) throw new ApiError("Fiche inaccessible.", 404);
    const { error } = await client
      .from("meeting_record_links")
      .upsert(
        { workspace_id: workspace, meeting_id: id, record_id },
        { onConflict: "workspace_id,meeting_id,record_id", ignoreDuplicates: true },
      );
    databaseError(error);
    return NextResponse.json({ ok: true, record_id });
  } catch (error) {
    return fail(error);
  }
}
export async function DELETE(req: NextRequest, { params }: P) {
  try {
    checkOrigin(req);
    const { client, workspace, id, meeting } = await meetingContext(params, true);
    const record = z.uuid().parse(req.nextUrl.searchParams.get("record"));
    if (record === meeting.record_id)
      throw new ApiError("La fiche principale ne peut pas être déplacée.");
    const { data, error } = await client
      .from("meeting_record_links")
      .delete()
      .eq("workspace_id", workspace)
      .eq("meeting_id", id)
      .eq("record_id", record)
      .select("id");
    databaseError(error);
    if (data?.length !== 1)
      throw new ApiError("Ce lien est inaccessible ou a déjà été retiré.", 409);
    return NextResponse.json({ ok: true, record_id: record });
  } catch (error) {
    return fail(error);
  }
}
