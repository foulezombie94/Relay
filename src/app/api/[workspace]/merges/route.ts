import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, checkOrigin, requireAdmin, fail } from "@/lib/api/context";
import { mergeError } from "@/lib/api/merge-errors";
type Params = { params: Promise<{ workspace: string }> };
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { workspace } = await params;
    const { client, role } = await context(workspace);
    requireAdmin(role);
    const mid = z.uuid().parse(request.nextUrl.searchParams.get("id"));
    const { data, error } = await client.rpc("preview_undo_merge", {
      w: workspace,
      mid,
    });
    mergeError(error);
    return NextResponse.json(
      { data },
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
        id: z.uuid(),
        source_version: z.number().int().positive(),
        target_version: z.number().int().positive(),
      })
      .parse(await request.json());
    const { data, error } = await client.rpc("undo_merge", {
      w: workspace,
      mid: body.id,
      sv: body.source_version,
      tv: body.target_version,
    });
    mergeError(error);
    return NextResponse.json({ data });
  } catch (e) {
    return fail(e);
  }
}
