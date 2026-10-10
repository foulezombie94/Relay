import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ApiError, databaseError } from "./context";
import { rpc } from "@/lib/agent/tools";
import {
  dashboardSchema,
  dashboardSettings,
  dashboardTemplate,
  resolveDashboardPeriod,
  tileFilters,
  isRecordVisual,
  isContentVisual,
  type DashboardInput,
  type DashboardResult,
  type DashboardSettings,
  type DashboardAggregate,
  type DashboardEntries,
  type ReportTile,
  type DateRange,
} from "@/lib/domain/dashboards";

const entriesSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.uuid(),
        record_id: z.uuid().nullable(),
        title: z.string(),
        stage: z.string().nullable(),
        status: z.string().nullable(),
        occurred_at: z.string().nullable(),
        currency: z.string().nullable(),
        amount: z.string().nullable(),
      }),
    )
    .max(50),
  total: z.number().int().nonnegative(),
  next_cursor: z.uuid().nullable(),
  partial: z.boolean(),
});
export function calendarMonth(tile: ReportTile, range: DateRange, now = new Date()) {
  const since = [tile.since, range.since]
    .filter((v): v is string => !!v)
    .sort((a, b) => Date.parse(a) - Date.parse(b))
    .at(-1);
  return new Date(since ?? now).toISOString().slice(0, 7);
}
function entryFilters(
  tile: ReportTile,
  settings: DashboardSettings,
  range: DateRange,
  month?: string,
) {
  const filters = tileFilters(tile, settings, range);
  if (month) {
    const year = Number(month.slice(0, 4)),
      m = Number(month.slice(5, 7)) - 1;
    const since = new Date(Date.UTC(year, m, 1)).toISOString();
    const until = new Date(Date.UTC(year, m + 1, 1)).toISOString();
    if (!filters.since || Date.parse(String(filters.since)) < Date.parse(since))
      filters.since = since;
    if (!filters.until || Date.parse(String(filters.until)) > Date.parse(until))
      filters.until = until;
    if (Date.parse(String(filters.since)) >= Date.parse(String(filters.until)))
      filters.empty = true;
  }
  return filters;
}
async function recordEntries(
  client: SupabaseClient,
  workspace: string,
  tile: ReportTile,
  settings: DashboardSettings,
  range: DateRange,
  cursor: string | null = null,
  month?: string,
): Promise<DashboardEntries> {
  const data = entriesSchema.parse(
    await rpc(client, "dashboard_details", {
      w: workspace,
      kind: tile.kind,
      metric: "count",
      group_by: "none",
      date_field: tile.date_field,
      filters: entryFilters(tile, settings, range, month),
      dimension: null,
      currency_filter: null,
      page_cursor: cursor,
    }),
  );
  return { ...data, ...(month ? { month } : {}) };
}

export async function readDashboard(
  client: SupabaseClient,
  workspace: string,
  id?: string,
  template: "sales" | "activity" | "management" = "management",
): Promise<DashboardInput> {
  if (!id) {
    const object = await client
      .from("objects")
      .select("id")
      .eq("workspace_id", workspace)
      .eq("slug", "deals")
      .maybeSingle();
    databaseError(object.error);
    if (!object.data) throw new ApiError("L’objet Opportunités est inaccessible.", 403);
    return dashboardTemplate(template, object.data.id);
  }
  const r = await client
    .from("report_dashboards")
    .select("name,description,visibility,config,settings")
    .eq("workspace_id", workspace)
    .eq("id", id)
    .maybeSingle();
  databaseError(r.error);
  if (!r.data) throw new ApiError("Dashboard inaccessible.", 403);
  return dashboardSchema.parse(r.data);
}
export async function dashboardResults(
  client: SupabaseClient,
  workspace: string,
  dashboard: DashboardInput,
  override?: DashboardSettings,
  now = new Date(),
): Promise<DashboardResult> {
  const settings = dashboardSettings.parse(override ?? dashboard.settings);
  const range = resolveDashboardPeriod(settings, now);
  const queries: Array<Record<string, unknown>> = [];
  const deadline = Date.now() + 45000;
  const indexes = dashboard.config.map((tile) => {
    if (isContentVisual(tile.visual) || isRecordVisual(tile.visual)) return null;
    const args = {
      kind: tile.kind,
      group_by: tile.group_by,
      metric: tile.metric,
      date_field: tile.date_field,
    };
    const current = queries.push({ ...args, filters: tileFilters(tile, settings, range) }) - 1;
    const previous = range.previous
      ? queries.push({ ...args, filters: tileFilters(tile, settings, range.previous) }) - 1
      : undefined;
    return { current, previous };
  });
  let batch: Array<{ result?: DashboardAggregate; error?: string }>;
  try {
    batch = queries.length
      ? await rpc(client, "dashboard_batch", { w: workspace, requests: queries })
      : [];
  } catch (error) {
    if (error instanceof ApiError && [401, 403].includes(error.status)) throw error;
    batch = queries.map(() => ({
      error: error instanceof ApiError ? error.message : "Cet indicateur n’a pas pu être calculé.",
    }));
  }
  const results: DashboardResult["tiles"] = dashboard.config.map((tile, index) => {
    const positions = indexes[index];
    if (!positions) return { tile };
    const current = batch[positions.current];
    const previous = positions.previous === undefined ? undefined : batch[positions.previous];
    const error =
      current?.error ||
      previous?.error ||
      (!current?.result ? "Résultat de calcul indisponible." : undefined);
    if (error) return { tile, error };
    const ignored =
      (settings.pipeline_id && tile.kind !== "record") ||
      (settings.owner_id && !["record", "task", "commitment"].includes(tile.kind));
    return {
      tile,
      current: current.result,
      previous: previous?.result,
      ...(ignored
        ? { filter_note: "Le filtre pipeline ou responsable CRM ne s’applique pas à cette source." }
        : {}),
    };
  });
  // Bounded record views use the existing invoker RPC; never a service-role read.
  const sourceIndexes = dashboard.config.flatMap((tile, i) =>
    isRecordVisual(tile.visual) ? [i] : [],
  );
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, sourceIndexes.length) }, async () => {
      while (next < sourceIndexes.length) {
        const i = sourceIndexes[next++];
        const tile = dashboard.config[i];
        if (Date.now() >= deadline) {
          results[i] = {
            tile,
            error: "Le calcul a dépassé son budget. Réduisez le nombre de vues ou les filtres.",
          };
          continue;
        }
        try {
          const month = tile.visual === "calendar" ? calendarMonth(tile, range, now) : undefined;
          results[i].entries = await recordEntries(
            client,
            workspace,
            tile,
            settings,
            range,
            null,
            month,
          );
          if (
            (settings.pipeline_id && tile.kind !== "record") ||
            (settings.owner_id && !["record", "task", "commitment"].includes(tile.kind))
          )
            results[i].filter_note =
              "Le filtre pipeline ou responsable CRM ne s’applique pas à cette source.";
        } catch (error) {
          if (error instanceof ApiError && [401, 403].includes(error.status)) throw error;
          results[i] = {
            tile,
            error: error instanceof ApiError ? error.message : "Cette vue n’a pas pu être chargée.",
          };
        }
      }
    }),
  );
  return { name: dashboard.name, tiles: results, settings, range, generated_at: now.toISOString() };
}
export async function dashboardDetails(
  client: SupabaseClient,
  workspace: string,
  dashboard: DashboardInput,
  settings: DashboardSettings,
  index: number,
  dimension: string | null,
  currency: string | null,
  cursor: string | null,
  month?: string,
) {
  const tile = dashboard.config[index];
  if (!tile) throw new ApiError("Indicateur introuvable.", 404);
  if (isContentVisual(tile.visual))
    throw new ApiError("Ce bloc ne possède pas de fiches sources.", 400);
  if (isRecordVisual(tile.visual)) {
    const range = resolveDashboardPeriod(settings);
    return recordEntries(
      client,
      workspace,
      tile,
      settings,
      range,
      cursor,
      tile.visual === "calendar" ? (month ?? calendarMonth(tile, range)) : undefined,
    );
  }
  return rpc(client, "dashboard_details", {
    w: workspace,
    kind: tile.kind,
    metric: tile.metric,
    group_by: tile.group_by,
    date_field: tile.date_field,
    filters: tileFilters(tile, settings, resolveDashboardPeriod(settings)),
    dimension,
    currency_filter: currency,
    page_cursor: cursor,
  });
}
