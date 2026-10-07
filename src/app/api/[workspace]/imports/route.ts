import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  context,
  checkOrigin,
  ApiError,
  databaseError,
  fail,
} from "@/lib/api/context";
import { inspectImportFile } from "@/lib/api/import-file";
import { prepareImport } from "@/lib/domain/imports";
import { crmSources, crmMapping } from "@/lib/domain/crm-migration";
import type { CrmSource } from "@/lib/domain/crm-migration";
import type { Attribute } from "@/lib/domain/types";
import { z } from "zod";
import { enqueueJob, workerReady } from "@/lib/jobs/client";
import { backgroundJobsEnabled } from "@/lib/jobs/flags";
import { adminDb } from "@/lib/supabase/admin";
export const maxDuration = 30;
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    checkOrigin(req);
    const { workspace } = await params;
    const { client } = await context(workspace, true);
    if (Number(req.headers.get("content-length") || 0) > 4_200_000)
      throw new ApiError("Fichier limité à 4 Mo.", 413);
    const form = await req.formData();
    const file = form.get("file");
    const objectId = z.uuid().parse(form.get("object_id"));
    if (!(file instanceof File)) throw new ApiError("Fichier requis.");
    const { data: object, error: oe } = await client
      .from("objects")
      .select("id,slug")
      .eq("workspace_id", workspace)
      .eq("id", objectId)
      .single();
    databaseError(oe);
    if (!object) throw new ApiError("Objet inaccessible.");
    const { data: attrs, error: ae } = await client
      .from("attributes")
      .select("*")
      .eq("workspace_id", workspace)
      .eq("object_id", objectId);
    databaseError(ae);
    const pipeline = z
      .uuid()
      .optional()
      .parse(form.get("pipeline_id") || undefined);
    if (pipeline && object.slug !== "deals")
      throw new ApiError("Pipeline réservé aux opportunités.");
    if (pipeline) {
      const { data: p, error: pe } = await client
        .from("pipelines")
        .select("id")
        .eq("workspace_id", workspace)
        .eq("id", pipeline)
        .maybeSingle();
      databaseError(pe);
      if (!p) throw new ApiError("Pipeline inaccessible.");
    }
    const numberFormat = z
      .enum(["comma", "dot"])
      .parse(form.get("number_format") || "comma");
    const duplicatePolicy = z
      .enum(["skip", "create"])
      .parse(form.get("duplicate_policy") || "skip");
    const mode = z
      .enum(["inspect", "preview", "commit"])
      .parse(form.get("mode") || "preview");
    const source = z
      .string()
      .refine((v) => crmSources.some((s) => s.id === v))
      .parse(form.get("source") || "file") as CrmSource;
    const migrationKey = z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[\p{L}\p{N} _.-]+$/u)
      .parse(form.get("migration_key") || "principal")
      .toLowerCase();
    const selection = z
      .string()
      .max(3)
      .optional()
      .parse(form.get("selection") || undefined);
    const headerRow = z.coerce
      .number()
      .int()
      .min(1)
      .max(25)
      .parse(form.get("header_row") || 1);
    let bundle;
    try {
      bundle = await inspectImportFile(file, { selection, headerRow, source });
    } catch (e) {
      throw new ApiError(e instanceof Error ? e.message : "Fichier illisible.");
    }
    if (!bundle.table) {
      if (mode !== "inspect")
        throw new ApiError("Choisissez une table avant de continuer.");
      return NextResponse.json({
        selections: bundle.selections,
        ignored: bundle.ignored,
        selection: null,
      });
    }
    const table = bundle.table;
    const mapping = z
      .record(z.string().max(200), z.string().max(100))
      .parse(
        form.get("mapping")
          ? JSON.parse(String(form.get("mapping")))
          : crmMapping(table.headers, object.slug),
      );
    if (mode === "inspect")
      return NextResponse.json({
        selections: bundle.selections,
        ignored: bundle.ignored,
        selection: bundle.selection,
        stages: [
          ...new Set(
            table.rows
              .map(
                (r) =>
                  r[
                    table.headers.indexOf(
                      Object.keys(mapping).find(
                        (h) => mapping[h] === "stage",
                      ) || "",
                    )
                  ] || "",
              )
              .filter(Boolean),
          ),
        ].slice(0, 100),
        headers: table.headers,
        mapping,
        total: table.rows.length,
        sample: table.rows.slice(0, 3),
        columnValues: Object.fromEntries(
          table.headers.map((h, i) => [
            h,
            [
              ...new Set(table.rows.map((r) => r[i]?.trim()).filter(Boolean)),
            ].slice(0, 100),
          ]),
        ),
      });
    const stageMap = z
      .record(
        z.string().max(200),
        z.enum([
          "Nouveau",
          "Qualification",
          "Proposition",
          "Négociation",
          "Gagné",
          "Perdu",
        ]),
      )
      .parse(JSON.parse(String(form.get("stage_map") || "{}")));
    let prepared;
    try {
      prepared = prepareImport(
        table,
        mapping,
        (attrs ?? []) as Attribute[],
        objectId,
        pipeline,
        numberFormat,
        {
          sourceKey: source + ":" + migrationKey,
          stageMap,
          deal: object.slug === "deals",
        },
      );
    } catch (e) {
      throw new ApiError(
        e instanceof Error ? e.message : "Correspondance invalide.",
      );
    }
    if (mode === "preview")
      return NextResponse.json({
        headers: table.headers,
        mapping,
        total: table.rows.length,
        valid: prepared.valid.length,
        errors: prepared.errors,
        preview: prepared.valid.slice(0, 20),
      });
    if (!prepared.valid.length)
      throw new ApiError("Aucune ligne valide à importer.");
    if (prepared.errors.length && form.get("accept_errors") !== "true")
      throw new ApiError(
        "Confirmez explicitement le rejet des lignes invalides avant import.",
      );
    const canonical = JSON.stringify({
      mapping: Object.fromEntries(
        Object.entries(mapping).sort(([a], [b]) => a.localeCompare(b)),
      ),
      pipeline,
      numberFormat,
      duplicatePolicy,
      source,
      migrationKey,
      selection: bundle.selection,
      headerRow,
      stageMap: Object.fromEntries(
        Object.entries(stageMap).sort(([a], [b]) => a.localeCompare(b)),
      ),
    });
    const digest = createHash("sha256")
      .update(Buffer.from(await file.arrayBuffer()))
      .update(canonical)
      .digest("hex");
    if (backgroundJobsEnabled()) {
      if (!(await workerReady(adminDb(), "imports")))
        throw new ApiError(
          "Le service d’import est temporairement indisponible. Réessayez dans quelques instants.",
          503,
        );
      const job = await enqueueJob(client, workspace, "imports", {
        object_id: objectId,
        rows_data: prepared.valid,
        digest,
        filename: file.name.slice(0, 255),
        mapping,
        duplicate_policy: duplicatePolicy,
        error_rows: prepared.errors,
      });
      return NextResponse.json({ queued: true, job }, { status: 202 });
    }
    const { data, error } = await client.rpc("import_crm_records", {
      w: workspace,
      obj: objectId,
      rows_data: prepared.valid,
      file_digest: digest,
      file_name: file.name.slice(0, 255),
      column_mapping: mapping,
      duplicate_policy: duplicatePolicy,
      error_rows: prepared.errors,
    });
    databaseError(error);
    return NextResponse.json({
      job: data,
      inserted: data.inserted,
      skipped: data.skipped,
      errors: data.errors,
      replayed: data.replayed,
      linked: data.linked,
      pending: data.pending,
    });
  } catch (e) {
    return fail(e);
  }
}
