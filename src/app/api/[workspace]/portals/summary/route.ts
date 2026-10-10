import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, fail } from "@/lib/api/context";
import { portalHeaders, portalSummariesForWorkspace } from "@/lib/api/portals";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    const { workspace } = await params;
    z.uuid().parse(workspace);
    const input = z
      .object({ ids: z.string().max(1000) })
      .strict()
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    const ids = input.ids ? input.ids.split(",") : [];
    const { client } = await context(workspace);
    return NextResponse.json(
      { data: await portalSummariesForWorkspace(client, workspace, ids) },
      { headers: portalHeaders },
    );
  } catch (e) {
    const response = fail(e);
    Object.entries(portalHeaders).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
}
