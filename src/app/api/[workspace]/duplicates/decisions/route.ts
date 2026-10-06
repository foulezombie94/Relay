import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, checkOrigin, fail, databaseError } from "@/lib/api/context";
import { mergeError } from "@/lib/api/merge-errors";
type Params = { params: Promise<{ workspace: string }> };
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { workspace } = await params;
    const { client } = await context(workspace);
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .parse(request.nextUrl.searchParams.get("page") ?? 0);
    const { data, error, count } = await client
      .from("duplicate_decisions")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspace)
      .order("updated_at", { ascending: false })
      .order("id")
      .range(page * 50, page * 50 + 49);
    databaseError(error);
    const ids = [
      ...new Set((data ?? []).flatMap((d) => [d.record_a, d.record_b])),
    ];
    const records = ids.length
      ? await client
          .from("records")
          .select("id,display_name,archived")
          .eq("workspace_id", workspace)
          .in("id", ids)
      : { data: [], error: null };
    databaseError(records.error);
    return NextResponse.json(
      {
        data: (data ?? []).map((d) => ({
          ...d,
          a_name: records.data?.find((r) => r.id === d.record_a)?.display_name,
          b_name: records.data?.find((r) => r.id === d.record_b)?.display_name,
        })),
        count,
        page,
      },
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
    const { client } = await context(workspace, true);
    const body = z
      .object({
        a: z.uuid(),
        b: z.uuid(),
        a_version: z.number().int().positive().optional(),
        b_version: z.number().int().positive().optional(),
        decision: z.enum(["separate", "deferred", "reopen"]),
      })
      .parse(await request.json());
    const { data, error } = await client.rpc("decide_duplicate", {
      w: workspace,
      a: body.a,
      b: body.b,
      av: body.a_version ?? null,
      bv: body.b_version ?? null,
      decision: body.decision,
    });
    mergeError(error);
    return NextResponse.json({ data });
  } catch (e) {
    return fail(e);
  }
}
