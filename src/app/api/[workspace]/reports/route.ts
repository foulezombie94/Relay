import { NextRequest, NextResponse } from "next/server";
import { context, databaseError, fail, ApiError } from "@/lib/api/context";
import { forecastDeals, type Pipeline } from "@/lib/domain/pipelines";
import {
  salesHistory,
  type HistoricalDeal,
  type SalesAudit,
} from "@/lib/domain/sales-history";
import { z } from "zod";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    const { workspace } = await params;
    const { client, user } = await context(workspace);
    const { data: object, error: oe } = await client
      .from("objects")
      .select("id")
      .eq("workspace_id", workspace)
      .eq("slug", "deals")
      .single();
    databaseError(oe);
    if (!object) throw new ApiError("Objet opportunités absent.");
    const pipeline = req.nextUrl.searchParams.get("pipeline");
    if (pipeline) z.uuid().parse(pipeline);
    const owner = req.nextUrl.searchParams.get("owner");
    if (owner && owner !== "me") z.uuid().parse(owner);
    const month = z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .parse(
        req.nextUrl.searchParams.get("month") ||
          new Date().toISOString().slice(0, 7),
      );
    const { data: pipelineRows, error: pe } = await client
      .from("pipelines")
      .select("*")
      .eq("workspace_id", workspace);
    databaseError(pe);
    const pipelines = (pipelineRows ?? []) as Pipeline[];
    const totals: Record<string, Record<string, number>> = {},
      counts: Record<string, number> = {},
      deals: HistoricalDeal[] = [];
    let page = 0;
    while (true) {
      let query = client
        .from("records")
        .select(
          "id,stage,amount,currency,pipeline_id,probability,close_date,lost_reason",
        )
        .eq("workspace_id", workspace)
        .eq("object_id", object.id)
        .eq("archived", false);
      if (pipeline) query = query.eq("pipeline_id", pipeline);
      if (owner) query = query.eq("owner_id", owner === "me" ? user.id : owner);
      const { data, error } = await query
        .order("id")
        .range(page * 500, page * 500 + 499);
      databaseError(error);
      for (const r of data ?? []) {
        counts[r.stage] = (counts[r.stage] ?? 0) + 1;
        totals[r.currency] ??= {};
        totals[r.currency][r.stage] =
          (totals[r.currency][r.stage] ?? 0) + Number(r.amount);
        deals.push(r);
      }
      if ((data?.length ?? 0) < 500) break;
      page++;
      if (page >= 100)
        throw new ApiError(
          "Rapport limité à 50 000 opportunités. Filtrez par pipeline ou responsable.",
          413,
        );
    }
    let tasksQuery = client
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace)
      .not("status", "in", "(done,cancelled)");
    if (owner)
      tasksQuery = tasksQuery.eq("owner_id", owner === "me" ? user.id : owner);
    const { count: tasks, error: te } = await tasksQuery;
    databaseError(te);
    const events: SalesAudit[] = [];
    let historyComplete = true;
    // Read only record audits for this object under the caller's RLS; never expose audit snapshots to the client.
    if (
      deals.some((deal) => deal.stage === "Gagné" || deal.stage === "Perdu")
    ) {
      for (let auditPage = 0; auditPage < 100; auditPage++) {
        const { data, error } = await client
          .from("audit_events")
          .select(
            "entity_id,created_at,before_stage:before_data->>stage,before_pipeline:before_data->>pipeline_id,after_stage:after_data->>stage,after_pipeline:after_data->>pipeline_id,after_version:after_data->>version",
          )
          .eq("workspace_id", workspace)
          .eq("entity", "records")
          .eq("after_data->>object_id", object.id)
          .order("id")
          .range(auditPage * 1000, auditPage * 1000 + 999);
        databaseError(error);
        events.push(
          ...(data ?? []).map((row) => ({
            entity_id: row.entity_id,
            created_at: row.created_at,
            before_data: {
              stage: row.before_stage ?? undefined,
              pipeline_id: row.before_pipeline,
            },
            after_data: {
              stage: row.after_stage ?? undefined,
              pipeline_id: row.after_pipeline,
              version: Number(row.after_version),
            },
          })),
        );
        if ((data?.length ?? 0) < 1000) break;
        if (auditPage === 99) historyComplete = false;
      }
    }
    return NextResponse.json({
      data: {
        total: deals.length,
        counts,
        totals,
        tasks: tasks ?? 0,
        forecast: forecastDeals(deals, pipelines),
        history: historyComplete
          ? salesHistory(
              deals,
              pipelines.filter((p) => !pipeline || p.id === pipeline),
              events,
              month,
            )
          : null,
        historyLimited: !historyComplete,
      },
    });
  } catch (e) {
    return fail(e);
  }
}
