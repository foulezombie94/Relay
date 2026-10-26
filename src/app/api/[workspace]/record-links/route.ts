import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, fail } from "@/lib/api/context";
import { readRecordLinks } from "@/lib/api/record-links";
type Params = { params: Promise<{ workspace: string }> };
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { workspace } = await params;
    const { client } = await context(workspace);
    const ids = z
      .array(z.uuid())
      .min(1)
      .max(50)
      .parse(request.nextUrl.searchParams.get("ids")?.split(","));
    const target = z.uuid().parse(request.nextUrl.searchParams.get("object_id"));
    return NextResponse.json(await readRecordLinks(client, workspace, [...new Set(ids)], target), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return fail(error);
  }
}
