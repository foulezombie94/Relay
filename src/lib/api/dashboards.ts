import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, databaseError } from "./context";
import { rpc } from "@/lib/agent/tools";
import {
  dashboardSchema,
  dashboardSettings,
  dashboardTemplate,
  resolveDashboardPeriod,
  tileFilters,
  type DashboardInput,
  type DashboardResult,
  type DashboardSettings,
  type DashboardAggregate,
} from "@/lib/domain/dashboards";

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
  const range = resolveDashboardPeriod(settings, now),
    deadline = Date.now() + 45000;
  const results: DashboardResult["tiles"] = new Array(dashboard.config.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, dashboard.config.length) }, async () => {
      while (next < dashboard.config.length) {
        const index = next++,
          tile = dashboard.config[index];
        const ignored =
          (settings.pipeline_id && tile.kind !== "record") ||
          (settings.owner_id && !["record", "task", "commitment"].includes(tile.kind));
        try {
          if (Date.now() >= deadline)
            throw new ApiError(
              "Délai de calcul atteint. Réduisez le nombre d’indicateurs ou la période.",
              408,
            );
          const args = {
            w: workspace,
            kind: tile.kind,
            group_by: tile.group_by,
            metric: tile.metric,
            date_field: tile.date_field,
          };
          const current = (await rpc(client, "dashboard_aggregate", {
            ...args,
            filters: tileFilters(tile, settings, range),
          })) as DashboardAggregate;
          let previous: DashboardAggregate | undefined;
          if (range.previous && Date.now() < deadline)
            previous = (await rpc(client, "dashboard_aggregate", {
              ...args,
              filters: tileFilters(tile, settings, range.previous),
            })) as DashboardAggregate;
          results[index] = {
            tile,
            current,
            previous,
            ...(ignored
              ? {
                  filter_note:
                    "Le filtre pipeline ou responsable CRM ne s’applique pas à cette source.",
                }
              : {}),
          };
        } catch (error) {
          if (error instanceof ApiError && [401, 403].includes(error.status)) throw error;
          results[index] = {
            tile,
            error:
              error instanceof ApiError ? error.message : "Cet indicateur n’a pas pu être calculé.",
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
) {
  const tile = dashboard.config[index];
  if (!tile) throw new ApiError("Indicateur introuvable.", 404);
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
