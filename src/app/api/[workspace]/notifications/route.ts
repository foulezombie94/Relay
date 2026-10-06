import { NextRequest, NextResponse } from "next/server";
import { context, checkOrigin, databaseError, fail } from "@/lib/api/context";
import { z } from "zod";
type P = { params: Promise<{ workspace: string }> };
export async function GET(req: NextRequest, { params }: P) {
  try {
    const { workspace } = await params;
    const { client } = await context(workspace);
    const p = req.nextUrl.searchParams;
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(100000)
      .parse(p.get("page") ?? 0);
    let query = client
      .from("notifications")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspace);
    if (p.get("unread") === "true") query = query.is("read_at", null);
    const [list, count] = await Promise.all([
      query
        .order("created_at", { ascending: false })
        .order("id")
        .range(page * 20, page * 20 + 19),
      client
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace)
        .is("read_at", null),
    ]);
    databaseError(list.error);
    databaseError(count.error);
    return NextResponse.json(
      { data: list.data, count: list.count, unread: count.count },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function PATCH(req: NextRequest, { params }: P) {
  try {
    checkOrigin(req);
    const { workspace } = await params;
    const { client } = await context(workspace);
    const body = z
      .object({ id: z.uuid().optional(), all: z.literal(true).optional() })
      .refine((v) => !!v.id || v.all === true)
      .parse(await req.json());
    let q = client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("workspace_id", workspace)
      .is("read_at", null);
    if (body.id) q = q.eq("id", body.id);
    const { error } = await q;
    databaseError(error);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
