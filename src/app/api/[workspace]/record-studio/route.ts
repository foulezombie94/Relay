import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  context,
  checkOrigin,
  requireAdmin,
  databaseError,
  ApiError,
  fail,
} from "@/lib/api/context";
import { boundedJsonBody } from "@/lib/api/workflow-body";
import { studioInput, studioRow, templateSpec, templateValues } from "@/lib/domain/record-studio";
import { resources } from "@/lib/domain/resource-schemas";
import { validateAttributes } from "@/lib/domain/attributes";
import type { Attribute } from "@/lib/domain/types";
type Params = { params: Promise<{ workspace: string }> };
const json = (value: unknown) =>
  NextResponse.json(value, { headers: { "Cache-Control": "private, no-store" } });
function checked(error: { code?: string; message: string } | null) {
  if (error?.code === "23505")
    throw new ApiError("Une seule fiche est autorisée, ou cette configuration existe déjà.", 409);
  if (error?.code === "22023")
    throw new ApiError(
      "Configuration incompatible avec les liens existants. Vérifiez les objets et les limites.",
    );
  databaseError(error);
}
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { workspace } = await params,
      { client, role } = await context(workspace);
    const object = z.uuid().parse(req.nextUrl.searchParams.get("object_id"));
    const configs = await client
      .from("record_configs")
      .select("*")
      .eq("workspace_id", workspace)
      .or(`object_id.eq.${object},and(kind.eq.relation,config->>target_object_id.eq.${object})`)
      .order("created_at")
      .limit(201);
    if (configs.error?.code === "42P01" || configs.error?.code === "PGRST205")
      throw new ApiError("La migration des fiches personnalisables doit être appliquée.", 503);
    databaseError(configs.error);
    const data = (configs.data ?? []).map((row) => studioRow.parse(row));
    if (data.length > 200)
      throw new ApiError(
        "Plus de 200 configurations pour cet objet. Réduisez les configurations actives.",
      );
    const id = req.nextUrl.searchParams.get("record_id");
    if (!id) {
      const templateIds = data
        .filter((c) => c.kind === "template" && c.object_id === object)
        .map((c) => c.id);
      if (["owner", "admin"].includes(role) && templateIds.length) {
        const schedules = await client
          .from("record_template_schedules")
          .select("config_id,next_run,paused,failure_count,last_error_code")
          .in("config_id", templateIds);
        databaseError(schedules.error);
        return json({ data, schedules: schedules.data });
      }
      return json({ data });
    }
    const record = z.uuid().parse(id);
    const source = await client
      .from("records")
      .select("id")
      .eq("workspace_id", workspace)
      .eq("object_id", object)
      .eq("id", record)
      .eq("archived", false)
      .is("merged_into", null)
      .maybeSingle();
    databaseError(source.error);
    if (!source.data) throw new ApiError("Fiche inaccessible.", 404);
    const links = await client
      .from("record_relations")
      .select("id,source_id,target_id,definition_id")
      .eq("workspace_id", workspace)
      .not("definition_id", "is", null)
      .or(`source_id.eq.${record},target_id.eq.${record}`)
      .order("id")
      .limit(201);
    databaseError(links.error);
    const relations = (links.data ?? []).slice(0, 200),
      ids = [
        ...new Set(
          relations.map((link) => (link.source_id === record ? link.target_id : link.source_id)),
        ),
      ];
    const related: unknown[] = [];
    for (let index = 0; index < ids.length; index += 100) {
      const result = await client
        .from("records")
        .select("id,object_id,display_name,email,domain")
        .eq("workspace_id", workspace)
        .in("id", ids.slice(index, index + 100))
        .eq("archived", false)
        .is("merged_into", null);
      databaseError(result.error);
      related.push(...(result.data ?? []));
    }
    const rollups = await client.rpc("record_rollups", { w: workspace, record });
    databaseError(rollups.error);
    const visible = new Set((related as { id: string }[]).map((row) => row.id));
    return json({
      data,
      records: related,
      links: relations.filter((link) =>
        visible.has(link.source_id === record ? link.target_id : link.source_id),
      ),
      rollups: rollups.data,
      partial: (links.data?.length ?? 0) > 200,
    });
  } catch (error) {
    return fail(error);
  }
}
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    checkOrigin(req);
    const { workspace } = await params,
      { client, user, role } = await context(workspace, true);
    requireAdmin(role);
    const body = z
      .object({
        id: z.uuid().optional(),
        version: z.number().int().positive().optional(),
        value: studioInput,
      })
      .strict()
      .parse(await boundedJsonBody(req, 65000));
    const value = body.value;
    const objects = await client
      .from("objects")
      .select("id")
      .eq("workspace_id", workspace)
      .in(
        "id",
        value.kind === "relation"
          ? [value.object_id, value.config.target_object_id]
          : [value.object_id],
      );
    databaseError(objects.error);
    if (
      !objects.data?.some((row) => row.id === value.object_id) ||
      (value.kind === "relation" &&
        !objects.data.some((row) => row.id === value.config.target_object_id))
    )
      throw new ApiError("Objet inaccessible.", 403);
    if (value.kind === "rollup") {
      const relation = await client
        .from("record_configs")
        .select("object_id,config")
        .eq("workspace_id", workspace)
        .eq("kind", "relation")
        .eq("id", value.config.relation_id)
        .maybeSingle();
      databaseError(relation.error);
      if (
        !relation.data ||
        (relation.data.object_id !== value.object_id &&
          (relation.data.config.target_object_id !== value.object_id ||
            !relation.data.config.inverse))
      )
        throw new ApiError("Choisissez une relation de cet objet.");
    }
    if (value.kind === "button") {
      const workflow = await client
        .from("workflows")
        .select("definition")
        .eq("workspace_id", workspace)
        .eq("id", value.config.workflow_id)
        .maybeSingle();
      databaseError(workflow.error);
      if (!workflow.data || workflow.data.definition.object_id !== value.object_id)
        throw new ApiError("Le workflow doit concerner cet objet.");
    }
    if (value.kind === "form" || value.kind === "layout") {
      const attrs = await client
        .from("attributes")
        .select("key")
        .eq("workspace_id", workspace)
        .eq("object_id", value.object_id)
        .eq("archived", false);
      databaseError(attrs.error);
      const allowed = new Set([
        "display_name",
        "email",
        "domain",
        "stage",
        "amount",
        "currency",
        "close_date",
        "owner_id",
        ...(attrs.data ?? []).map((attr) => "attr_" + attr.key),
      ]);
      const fields =
        value.kind === "form"
          ? value.config.questions.map((q) => q.property)
          : [...value.config.pinned, ...value.config.groups.flatMap((g) => g.fields)];
      if (fields.some((field) => !allowed.has(field)))
        throw new ApiError("Une propriété n’existe plus dans cet objet.");
    }
    if (body.id && !body.version) throw new ApiError("Version requise.");
    const query = body.id
      ? client
          .from("record_configs")
          .update(value)
          .eq("workspace_id", workspace)
          .eq("id", body.id)
          .eq("version", body.version!)
      : client
          .from("record_configs")
          .insert({ ...value, workspace_id: workspace, created_by: user.id });
    const result = await query.select().maybeSingle();
    checked(result.error);
    if (!result.data) throw new ApiError("La configuration a changé, rechargez-la.", 409);
    return json({ data: studioRow.parse(result.data) });
  } catch (error) {
    return fail(error);
  }
}
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    checkOrigin(req);
    const { workspace } = await params,
      { client, role } = await context(workspace, true);
    requireAdmin(role);
    const id = z.uuid().parse(req.nextUrl.searchParams.get("id")),
      version = z.coerce.number().int().positive().parse(req.nextUrl.searchParams.get("version"));
    const dependents = await client
      .from("record_configs")
      .select("id")
      .eq("workspace_id", workspace)
      .eq("kind", "rollup")
      .contains("config", { relation_id: id })
      .limit(1);
    databaseError(dependents.error);
    if (dependents.data?.length)
      throw new ApiError("Retirez d’abord les calculs qui utilisent cette relation.");
    const result = await client
      .from("record_configs")
      .delete()
      .eq("workspace_id", workspace)
      .eq("id", id)
      .eq("version", version)
      .select("id")
      .maybeSingle();
    databaseError(result.error);
    if (!result.data) throw new ApiError("Configuration modifiée ou inaccessible.", 409);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
export async function POST(req: NextRequest, { params }: Params) {
  try {
    checkOrigin(req);
    const { workspace } = await params,
      { client } = await context(workspace, true);
    const body = z
      .discriminatedUnion("action", [
        z.object({
          action: z.literal("link"),
          definition: z.uuid(),
          record: z.uuid(),
          target: z.uuid(),
          unlink: z.boolean().default(false),
          inverse_direction: z.boolean().default(false),
        }),
        z.object({
          action: z.literal("template"),
          configuration: z.uuid(),
          attempt: z.uuid(),
          values: z.record(z.string(), z.unknown()),
        }),
      ])
      .parse(await boundedJsonBody(req, 40000));
    if (body.action === "link") {
      const result = await client.rpc("record_link_change", {
        w: workspace,
        definition: body.definition,
        record: body.record,
        target: body.target,
        unlink: body.unlink,
        inverse_direction: body.inverse_direction,
      });
      checked(result.error);
      return json({ ok: true });
    }
    const config = await client
      .from("record_configs")
      .select("object_id,name,config")
      .eq("workspace_id", workspace)
      .eq("id", body.configuration)
      .eq("kind", "template")
      .maybeSingle();
    databaseError(config.error);
    if (!config.data) throw new ApiError("Modèle inaccessible.", 404);
    const spec = templateSpec.parse(config.data.config);
    const overrides = templateValues.parse(body.values);
    const values = resources.records.parse({
      ...spec.values,
      ...overrides,
      display_name: overrides.display_name || spec.values.display_name || config.data.name,
      attributes: { ...spec.values.attributes, ...overrides.attributes },
      object_id: config.data.object_id,
    });
    const attrs = await client
      .from("attributes")
      .select("*")
      .eq("workspace_id", workspace)
      .eq("object_id", config.data.object_id);
    databaseError(attrs.error);
    const issues = validateAttributes(values.attributes ?? {}, (attrs.data ?? []) as Attribute[]);
    if (issues.length) throw new ApiError(issues.join(" "));
    const result = await client.rpc("record_template_apply", {
      w: workspace,
      configuration: body.configuration,
      payload: overrides,
      attempt: body.attempt,
    });
    checked(result.error);
    return json({ data: { id: result.data } });
  } catch (error) {
    return fail(error);
  }
}
