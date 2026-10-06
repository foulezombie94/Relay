import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { context, fail, databaseError } from "@/lib/api/context";
import { recordQuery } from "@/lib/api/record-query";
import { safeCsvCell } from "@/lib/domain/attributes";
import { viewConfigSchema } from "@/lib/domain/views";
import { z } from "zod";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    const { workspace } = await params;
    const { client, user } = await context(workspace);
    z.uuid().parse(req.nextUrl.searchParams.get("object_id"));
    const requested = req.nextUrl.searchParams.get("columns")?.split(",");
    const parsed = viewConfigSchema.safeParse({
      columns: requested ?? [
        "display_name",
        "email",
        "domain",
        "stage",
        "amount",
      ],
    });
    if (!parsed.success) throw parsed.error;
    const exportFields = [
      ...new Set([
        "id",
        ...parsed.data.columns,
        ...(parsed.data.columns.includes("amount") ? ["currency"] : []),
      ]),
    ];
    const rows: Record<string, unknown>[] = [];
    let page = 0;
    while (true) {
      const { data, error } = await recordQuery(
        client,
        workspace,
        req.nextUrl.searchParams,
        user.id,
      ).range(page * 500, page * 500 + 499);
      databaseError(error);
      for (const r of data ?? []) {
        const record = r as unknown as Record<string, unknown>;
        const attrs = (record.attributes ?? {}) as Record<string, unknown>;
        rows.push(
          Object.fromEntries(
            exportFields.map((key) => {
              const value = key.startsWith("attr_")
                ? attrs[key.slice(5)]
                : record[key];
              return [
                key,
                safeCsvCell(
                  typeof value === "object" && value !== null
                    ? JSON.stringify(value)
                    : value,
                ),
              ];
            }),
          ),
        );
      }
      if ((data?.length ?? 0) < 500) break;
      page++;
    }
    const csv = Papa.unparse(
      rows.length ? rows : { fields: exportFields, data: [] },
    );
    return new NextResponse("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="relay-view.csv"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return fail(e);
  }
}
