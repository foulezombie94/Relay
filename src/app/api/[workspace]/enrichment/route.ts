import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin, context, databaseError, fail, jsonBody } from "@/lib/api/context";

type Params = { params: Promise<{ workspace: string }> };
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { workspace } = await params;
    const { client } = await context(workspace);
    const record = z.uuid().parse(request.nextUrl.searchParams.get("record"));
    const { data, error } = await client
      .from("record_enrichments")
      .select("record_id,status,data,sources,error,requested_at,enriched_at")
      .eq("workspace_id", workspace)
      .eq("record_id", record)
      .maybeSingle();
    databaseError(error);
    return NextResponse.json({ data: data ?? null }, { headers: noStore });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    checkOrigin(request);
    const { workspace } = await params;
    const { client } = await context(workspace, true);
    const { record } = z
      .object({ record: z.uuid() })
      .strict()
      .parse(await jsonBody(request));
    const { data, error } = await client.rpc("request_enrichment", { w: workspace, rec: record });
    databaseError(error);
    return NextResponse.json({ status: data }, { status: 202, headers: noStore });
  } catch (error) {
    return fail(error);
  }
}
