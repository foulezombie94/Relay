import { NextRequest, NextResponse } from "next/server";
import { context, fail } from "@/lib/api/context";
import { rpc } from "@/lib/agent/tools";
import { z } from "zod";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    const { workspace } = await params;
    const { client, user } = await context(workspace);
    const owner = req.nextUrl.searchParams.get("owner");
    const data = await rpc(client, "crm_priorities", {
      w: workspace,
      owner_filter: owner === "me" ? user.id : owner ? z.uuid().parse(owner) : null,
      page_offset: z.coerce
        .number()
        .int()
        .min(0)
        .max(1000000)
        .parse(req.nextUrl.searchParams.get("offset") || 0),
      page_size: 50,
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return fail(e);
  }
}
