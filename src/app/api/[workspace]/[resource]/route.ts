import { NextRequest, NextResponse } from "next/server";
import {
  context,
  checkOrigin,
  fail,
  ApiError,
  databaseError,
  requireAdmin,
} from "@/lib/api/context";
import { resources, isResource, readResources } from "@/lib/api/resources";
import { validateAttributes } from "@/lib/domain/attributes";
import type { Attribute } from "@/lib/domain/types";
import { z } from "zod";
import { recordQuery } from "@/lib/api/record-query";
type Params = { params: Promise<{ workspace: string; resource: string }> };
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { workspace, resource } = await params;
    if (!(readResources as readonly string[]).includes(resource))
      throw new ApiError("Ressource inconnue.", 404);
    const { client, user } = await context(workspace);
    const p = request.nextUrl.searchParams;
    const page = Math.max(0, Number(p.get("page") ?? 0) || 0),
      size = Math.min(100, Math.max(1, Number(p.get("size") ?? 50) || 50));
    if (resource === "records") {
      const { data, error, count } = await recordQuery(
        client,
        workspace,
        p,
        user.id,
      ).range(page * size, (page + 1) * size - 1);
      databaseError(error);
      return NextResponse.json({ data, count, page, size });
    }
    let query = client
      .from(resource)
      .select(
        resource === "records"
          ? "id,workspace_id,object_id,display_name,email,domain,stage,amount,currency,owner_id,attributes,archived,version,close_date,created_at,updated_at"
          : "*",
        { count: "exact" },
      )
      .eq("workspace_id", workspace);
    for (const key of [
      "id",
      "object_id",
      "record_id",
      "portal_id",
      "list_id",
      "workflow_id",
      "status",
      "stage",
      "source_id",
      "target_id",
    ])
      if (p.get(key)) query = query.eq(key, p.get(key)!);
    if (resource === "records") {
      query = query.eq("archived", p.get("archived") === "true");
      const search = p.get("q")?.trim();
      if (search)
        query = query.textSearch("search", search, {
          type: "websearch",
          config: "simple",
        });
    }
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(page * size, (page + 1) * size - 1);
    databaseError(error);
    return NextResponse.json({ data, count, page, size });
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
    if (["objects", "attributes", "portal_members"].includes(resource))
      requireAdmin(role);
    const result = resources[resource].safeParse(await request.json());
    if (!result.success)
      throw new ApiError(result.error.issues.map((i) => i.message).join(" "));
    const values: Record<string, unknown> = {
      ...result.data,
      workspace_id: workspace,
    };
    if (resource === "records") {
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
      const { data: deal } = await client
        .from("records")
        .select("stage")
        .eq("workspace_id", workspace)
        .eq("id", values.record_id)
        .single();
      if (deal?.stage !== "Gagné")
        throw new ApiError(
          "Le dossier de réalisation nécessite une opportunité gagnée.",
        );
      const { data: commitments } = await client
        .from("commitments")
        .select("id,title,status,due_date,source_quote")
        .eq("workspace_id", workspace)
        .eq("record_id", values.record_id)
        .in("status", ["confirmed", "in_progress", "done"]);
      values.commitments_snapshot = commitments ?? [];
    }
    const { data, error } = await client
      .from(resource)
      .insert(values)
      .select()
      .single();
    databaseError(error);
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
    if (["objects", "attributes", "portal_members"].includes(resource))
      requireAdmin(role);
    const body = await request.json();
    const rowId = z.uuid().parse(body.id);
    const schema = resources[resource].partial();
    const parsed = schema.safeParse(body.values);
    if (!parsed.success)
      throw new ApiError(parsed.error.issues.map((i) => i.message).join(" "));
    const values: Record<string, unknown> = { ...parsed.data };
    for (const immutable of [
      "object_id",
      "record_id",
      "portal_id",
      "list_id",
      "source_id",
      "target_id",
    ])
      if (immutable in values)
        throw new ApiError("Cette relation ne peut pas être déplacée.");
    if (
      ["records", "notes", "handovers", "workflows"].includes(resource) &&
      !Number.isInteger(body.version)
    )
      throw new ApiError("Version de la fiche requise.");
    if (resource === "records" && values.attributes) {
      const { data: record } = await client
        .from("records")
        .select("object_id,attributes")
        .eq("workspace_id", workspace)
        .eq("id", rowId)
        .single();
      if (!record) throw new ApiError("Fiche inaccessible.", 404);
      const { data: attrs } = await client
        .from("attributes")
        .select("*")
        .eq("workspace_id", workspace)
        .eq("object_id", record.object_id);
      const problems = validateAttributes(
        values.attributes as Record<string, unknown>,
        (attrs ?? []) as Attribute[],
        record.attributes as Record<string, unknown>,
      );
      if (problems.length) throw new ApiError(problems.join(" "));
    }
    if (resource === "commitments" && values.status === "done") {
      const { data: old } = await client
        .from("commitments")
        .select("evidence")
        .eq("id", rowId)
        .eq("workspace_id", workspace)
        .single();
      if (!String(values.evidence ?? old?.evidence ?? "").trim())
        throw new ApiError(
          "Ajoutez une preuve avant de clôturer cet engagement.",
        );
    }
    let query = client
      .from(resource)
      .update(values)
      .eq("workspace_id", workspace)
      .eq("id", rowId);
    if (body.version !== undefined) query = query.eq("version", body.version);
    const { data, error } = await query.select().maybeSingle();
    databaseError(error);
    if (!data)
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
    const { client } = await context(workspace, true);
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
      if (!data)
        throw new ApiError("Élément inaccessible ou déjà retiré.", 404);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
