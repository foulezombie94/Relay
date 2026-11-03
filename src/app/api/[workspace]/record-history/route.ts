import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, databaseError, fail } from "@/lib/api/context";
import { fieldChangeSchema } from "@/lib/domain/record-history";

type Params = { params: Promise<{ workspace: string }> };
const field = z
  .string()
  .regex(
    /^(display_name|email|domain|stage|amount|currency|owner_id|close_date|pipeline_id|probability|lost_reason|archived|attributes\.[a-z][a-z0-9_]{0,49})$/,
  );

/** Field-level changes of one record, derived from its audit trail (RLS applies). */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { workspace } = await params;
    const { client } = await context(workspace);
    const p = request.nextUrl.searchParams;
    const record = z.uuid().parse(p.get("record"));
    const { data, error } = await client.rpc("record_field_history", {
      w: workspace,
      rec: record,
      field_filter: p.get("field") ? field.parse(p.get("field")) : null,
      before_at: p.get("before") ? z.iso.datetime({ offset: true }).parse(p.get("before")) : null,
      page_size: Math.min(200, Math.max(1, Number(p.get("size") ?? 50) || 50)),
    });
    databaseError(error);
    return NextResponse.json(
      { data: z.array(fieldChangeSchema).parse(data ?? []) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return fail(error);
  }
}
