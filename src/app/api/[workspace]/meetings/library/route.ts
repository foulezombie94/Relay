import { NextRequest, NextResponse } from "next/server";
import { context, databaseError, fail } from "@/lib/api/context";
import { meetingFilters, meetingLibrarySchema } from "@/lib/domain/meetings";
type P = { params: Promise<{ workspace: string }> };
export async function GET(req: NextRequest, { params }: P) {
  try {
    const { workspace } = await params;
    const { client } = await context(workspace);
    const filters = meetingFilters.parse(Object.fromEntries(req.nextUrl.searchParams));
    const { data, error } = await client.rpc("meeting_library", { w: workspace, filters });
    databaseError(error);
    return NextResponse.json(meetingLibrarySchema.parse(data), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return fail(error);
  }
}
