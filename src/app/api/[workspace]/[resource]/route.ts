import { NextRequest, NextResponse } from "next/server";
import {
  context,
  checkOrigin,
  fail,
  ApiError,
  databaseError,
  requireAdmin,
  jsonBody,
} from "@/lib/api/context";
import { boundedJsonBody } from "@/lib/api/workflow-body";
import { assertReplayedValues } from "@/lib/api/save-attempt";
import { resources, isResource, readResources } from "@/lib/domain/resource-schemas";
import { validateAttributes } from "@/lib/domain/attributes";
import type { Attribute } from "@/lib/domain/types";
import { z } from "zod";
import { recordQuery } from "@/lib/api/record-query";
import { resourceQuery } from "@/lib/api/resource-query";
type Params = { params: Promise<{ workspace: string; resource: string }> };
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { workspace, resource } = await params;
    if (!(readResources as readonly string[]).includes(resource))
      throw new ApiError("Ressource inconnue.", 404);
    const { client, user } = await context(workspace);
    const p = request.nextUrl.searchParams;
    const page = Math.max(0, Math.floor(Number(p.get("page") ?? 0) || 0)),
      size = Math.min(100, Math.max(1, Math.floor(Number(p.get("size") ?? 50) || 50)));
    if (resource === "records") {
      const { data, error, count } = await recordQuery(
        client,
        workspace,
        p,
        user.id,
        // Lists count matches on their first page and pass count=0 for the next ones.
        p.get("count") !== "0",
      ).range(page * size, (page + 1) * size - 1);
      databaseError(error);
      return NextResponse.json({ data, count, page, size });
    }
    const { data, error, count } = await resourceQuery(client, workspace, resource, p, user.id)
      .range(page * size, (page + 1) * size - 1)
      .overrideTypes<
        (Record<string, unknown> & { record_id?: string | null })[],
        { merge: false }
      >();
    databaseError(error);
    const ids = [...new Set((data ?? []).map((row) => row.record_id).filter(Boolean))];
    let result = data;
    if (ids.length) {
      const { data: related, error: re } = await client
        .from("records")
        .select("id,display_name,object_id,archived")
        .eq("workspace_id", workspace)
        .in("id", ids);
      databaseError(re);
      result = (data ?? []).map((row) => ({
        ...row,
        record: related?.find((record) => record.id === row.record_id) ?? null,
      }));
    }
    return NextResponse.json(
      { data: result, count, page, size },
      ["meetings", "meeting_insight_templates"].includes(resource)
        ? { headers: { "Cache-Control": "private, no-store" } }
        : undefined,
    );
  } catch (error) {
    return fail(error);
  }
}
export async function POST(request: NextRequest, { params }: Params) {
  try {
    checkOrigin(request);
    const { workspace, resource } = await params;
    if (!isResource(resource)) throw new ApiError("Ressource inconnue.", 404);
    const { client, role } = await context(workspace, true);
    if (["objects", "attributes", "portal_members", "pipelines"].includes(resource))
      requireAdmin(role);
    const result = resources[resource].safeParse(
      ["meetings", "meeting_insight_templates"].includes(resource)
        ? await boundedJsonBody(request, 1100000)
        : await jsonBody(request),
    );
    if (!result.success) throw new ApiError(result.error.issues.map((i) => i.message).join(" "));
    const values: Record<string, unknown> = {
      ...result.data,
      workspace_id: workspace,
    };
    if (resource === "records") {
      if (values.stage === "Perdu" && !String(values.lost_reason ?? "").trim())
        throw new ApiError("Précisez la raison de perte.");
      const { data: attrs, error } = await client
        .from("attributes")
        .select("*")
        .eq("workspace_id", workspace)
        .eq("object_id", values.object_id);
      databaseError(error);
      const problems = validateAttributes(
        (values.attributes ?? {}) as Record<string, unknown>,
        (attrs ?? []) as Attribute[],
      );
      if (problems.length) throw new ApiError(problems.join(" "));
    }
    if (resource === "handovers") {
      const { data: deal, error: dealError } = await client
        .from("records")
        .select("stage")
        .eq("workspace_id", workspace)
        .eq("id", values.record_id)
        .single();
      databaseError(dealError);
      if (deal?.stage !== "Gagné")
        throw new ApiError("Le dossier de réalisation nécessite une opportunité gagnée.");
      const { data: commitments, error: commitmentsError } = await client
        .from("commitments")
        .select("id,title,status,due_date,source_quote")
        .eq("workspace_id", workspace)
        .eq("record_id", values.record_id)
        .in("status", ["confirmed", "in_progress", "done"]);
      databaseError(commitmentsError);
      values.commitments_snapshot = commitments ?? [];
    }
    const key = request.headers.get("Idempotency-Key");
    if (key) values.id = z.uuid().parse(key);
    const { data, error } = await client.from(resource).insert(values).select().single();
    if (error?.code === "23505" && key) {
      const { data: existing, error: readError } = await client
        .from(resource)
        .select()
        .eq("workspace_id", workspace)
        .eq("id", key)
        .maybeSingle();
      databaseError(readError);
      if (existing) {
        try {
          assertReplayedValues(existing, values);
        } catch {
          throw new ApiError(
            "Cet enregistrement existe avec des valeurs différentes. Rechargez avant de réessayer.",
            409,
          );
        }
        return NextResponse.json({ data: existing });
      }
    }
    databaseError(error);
    if (!data || !z.uuid().safeParse(data.id).success || (key && data.id !== key))
      throw new ApiError("Aucune ligne enregistrée n’a été confirmée.", 500);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    checkOrigin(request);
    const { workspace, resource } = await params;
    if (!isResource(resource)) throw new ApiError("Ressource inconnue.", 404);
    const { client, role } = await context(workspace, true);
    if (["objects", "attributes", "portal_members", "pipelines"].includes(resource))
      requireAdmin(role);
    const body = z
      .object({
        id: z.uuid(),
        version: z.number().int().positive().optional(),
        values: z.record(z.string(), z.unknown()),
      })
      .parse(
        ["meetings", "meeting_insight_templates"].includes(resource)
          ? await boundedJsonBody(request, 1100000)
          : await jsonBody(request),
      );
    const rowId = body.id;
    const schema = resources[resource].partial();
    const parsed = schema.safeParse(body.values);
    if (!parsed.success) throw new ApiError(parsed.error.issues.map((i) => i.message).join(" "));
    const values: Record<string, unknown> = { ...parsed.data };
    if (!Object.keys(values).length) throw new ApiError("Aucune modification à enregistrer.");
    for (const immutable of [
      "object_id",
      "record_id",
      "portal_id",
      "list_id",
      "source_id",
      "target_id",
    ])
      if (immutable in values) throw new ApiError("Cette relation ne peut pas être déplacée.");
    if (
      [
        "meetings",
        "meeting_insight_templates",
        "tasks",
        "commitments",
        "conflicts",
        "sequences",
        "records",
        "notes",
        "handovers",
        "workflows",
        "pipelines",
        "email_templates",
        "report_dashboards",
      ].includes(resource) &&
      !Number.isInteger(body.version)
    )
      throw new ApiError("Version de la fiche requise.");
    if (resource === "records" && values.stage === "Perdu") {
      const { data: current, error: readError } = await client
        .from("records")
        .select("lost_reason")
        .eq("workspace_id", workspace)
        .eq("id", rowId)
        .single();
      databaseError(readError);
      if (!String(values.lost_reason ?? current?.lost_reason ?? "").trim())
        throw new ApiError("Précisez la raison de perte.");
    }
    if (resource === "records" && values.attributes) {
      const { data: record, error: recordError } = await client
        .from("records")
        .select("object_id,attributes")
        .eq("workspace_id", workspace)
        .eq("id", rowId)
        .single();
      databaseError(recordError);
      if (!record) throw new ApiError("Fiche inaccessible.", 404);
      const { data: attrs, error: attrsError } = await client
        .from("attributes")
        .select("*")
        .eq("workspace_id", workspace)
        .eq("object_id", record.object_id);
      databaseError(attrsError);
      const problems = validateAttributes(
        values.attributes as Record<string, unknown>,
        (attrs ?? []) as Attribute[],
        record.attributes as Record<string, unknown>,
      );
      if (problems.length) throw new ApiError(problems.join(" "));
    }
    if (resource === "commitments" && values.status === "done") {
      const { data: old, error: oldError } = await client
        .from("commitments")
        .select("evidence")
        .eq("id", rowId)
        .eq("workspace_id", workspace)
        .single();
      databaseError(oldError);
      if (!String(values.evidence ?? old?.evidence ?? "").trim())
        throw new ApiError("Ajoutez une preuve avant de clôturer cet engagement.");
    }
    let query = client.from(resource).update(values).eq("workspace_id", workspace).eq("id", rowId);
    if (body.version !== undefined) query = query.eq("version", body.version);
    const { data, error } = await query.select().maybeSingle();
    databaseError(error);
    if (!data || data.id !== rowId)
      throw new ApiError(
        "La fiche a changé ou vous n’y avez plus accès. Rechargez avant de réessayer.",
        409,
      );
    return NextResponse.json({ data });
  } catch (error) {
    return fail(error);
  }
}
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    checkOrigin(request);
    const { workspace, resource } = await params;
    if (!isResource(resource) || ["objects", "attributes"].includes(resource))
      throw new ApiError("Archivez cet élément plutôt que le supprimer.");
    const { client, role } = await context(workspace, true);
    if (resource === "pipelines") requireAdmin(role);
    const id = z.uuid().parse(request.nextUrl.searchParams.get("id"));
    if (resource === "records") {
      const { data, error } = await client
        .from("records")
        .update({ archived: true })
        .eq("workspace_id", workspace)
        .eq("id", id)
        .select("id")
        .maybeSingle();
      databaseError(error);
      if (!data) throw new ApiError("Fiche inaccessible.", 404);
    } else {
      const { data, error } = await client
        .from(resource)
        .delete()
        .eq("workspace_id", workspace)
        .eq("id", id)
        .select("id")
        .maybeSingle();
      databaseError(error);
      if (!data) throw new ApiError("Élément inaccessible ou déjà retiré.", 404);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
