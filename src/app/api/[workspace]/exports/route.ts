import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { ApiError, context, fail, databaseError, checkOrigin } from "@/lib/api/context";
import { recordQuery } from "@/lib/api/record-query";
import { safeCsvCell } from "@/lib/domain/attributes";
import { recordExportFields } from "@/lib/domain/exports";
import { viewConfigSchema } from "@/lib/domain/views";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;
const maxRows = 10000;
const maxBytes = 4 * 1024 * 1024;
function download(body: string | Uint8Array, type: string, filename: string) {
  if (Buffer.byteLength(body) > maxBytes)
    throw new ApiError(
      "Cet export dépasse 4 Mo. Réduisez les filtres ou le nombre de colonnes.",
      413,
    );
  return new NextResponse(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    checkOrigin(req);
    const { workspace } = await params;
    const { client, user } = await context(workspace);
    const p = req.nextUrl.searchParams;
    const objectId = z.uuid().parse(p.get("object_id"));
    const format = z.enum(["csv", "xlsx", "json", "tsv"]).parse(p.get("format") ?? "csv");
    const scope = z.enum(["view", "all"]).parse(p.get("scope") ?? "view");
    const columnMode = z.enum(["selected", "all"]).parse(p.get("column_mode") ?? "selected");
    const headers = z
      .enum(["keys", "labels"])
      .parse(p.get("headers") ?? (format === "xlsx" ? "labels" : "keys"));
    const delimiter = z.enum([",", ";"]).parse(p.get("delimiter") ?? ",");
    const { data: object, error: objectError } = await client
      .from("objects")
      .select("slug,name")
      .eq("workspace_id", workspace)
      .eq("id", objectId)
      .single();
    databaseError(objectError);
    if (!object) throw new ApiError("Cet objet est inaccessible.", 404);
    const { data: attributes, error: attrError } = await client
      .from("attributes")
      .select("key,name,type")
      .eq("workspace_id", workspace)
      .eq("object_id", objectId)
      .eq("archived", false)
      .order("key")
      .limit(101);
    databaseError(attrError);
    if ((attributes?.length ?? 0) > 100)
      throw new ApiError(
        "Export limité à 100 champs personnalisés. Sélectionnez un objet moins volumineux.",
        413,
      );
    const available = recordExportFields(object.slug, attributes ?? []);
    const allowed = new Map(available.map((field) => [field.key, field]));
    const requested = z
      .array(z.string().max(60))
      .min(1)
      .max(120)
      .parse(p.get("columns")?.split(",") ?? ["display_name", "email", "domain", "stage"]);
    if (requested.some((key) => !allowed.has(key)))
      throw new ApiError("Une colonne demandée est inconnue ou archivée. Actualisez la vue.");
    const fields = [
      ...new Set([
        "id",
        ...(columnMode === "all" ? available.map((field) => field.key) : requested),
        ...(requested.includes("amount") ? ["currency"] : []),
      ]),
    ];
    // Validate all view criteria, independently of the chosen export columns.
    viewConfigSchema.parse({
      search: p.get("q") ?? "",
      stage: p.get("stage") ?? "",
      owner: p.get("owner") ?? "",
      minimum: p.get("minimum") ?? "",
      sort: p.get("sort") ?? "updated_at",
      direction: p.get("direction") ?? "desc",
      pipeline_id: p.get("pipeline_id") ?? "",
    });
    const queryParams =
      scope === "all"
        ? new URLSearchParams({
            object_id: objectId,
            sort: p.get("sort") ?? "updated_at",
            direction: p.get("direction") ?? "desc",
          })
        : new URLSearchParams(p);
    // Export active records only, even for a manually crafted request.
    queryParams.delete("archived");
    const rows: Record<string, unknown>[] = [];
    let bytes = 0;
    const signal = AbortSignal.timeout(25000);
    for (let offset = 0; offset <= maxRows; offset += 500) {
      const { data, error } = await recordQuery(client, workspace, queryParams, user.id, false)
        .range(offset, offset + (offset === maxRows ? 0 : 499))
        .abortSignal(signal);
      databaseError(error);
      if (offset === maxRows && data?.length)
        throw new ApiError(
          "Export limité à 10 000 fiches. Utilisez les filtres pour exporter plusieurs lots.",
          413,
        );
      for (const r of data ?? []) {
        const record = r as unknown as Record<string, unknown>;
        const attrs = (record.attributes ?? {}) as Record<string, unknown>;
        const row = Object.fromEntries(
          fields.map((key) => [
            key,
            (key.startsWith("attr_") ? attrs[key.slice(5)] : record[key]) ?? null,
          ]),
        );
        bytes += Buffer.byteLength(JSON.stringify(row));
        if (bytes > 3 * 1024 * 1024)
          throw new ApiError(
            "Ces données sont trop volumineuses pour un export direct. Réduisez les filtres ou les colonnes.",
            413,
          );
        rows.push(row);
      }
      if ((data?.length ?? 0) < 500) break;
    }
    const filename =
      "relay-" +
      object.slug.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 60) +
      "-" +
      new Date().toISOString().slice(0, 10) +
      "." +
      format;
    if (format === "json")
      return download(JSON.stringify(rows, null, 2), "application/json; charset=utf-8", filename);
    // Include keys in readable headers to avoid collisions between custom field names.
    const labels = fields.map((key) =>
      headers === "labels" ? `${allowed.get(key)?.label ?? key} [${key}]` : key,
    );
    const cells = rows.map((row) =>
      fields.map((key) => {
        const value = row[key];
        return typeof value === "object" && value !== null ? JSON.stringify(value) : (value ?? "");
      }),
    );
    if (format === "xlsx") {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Relay";
      const sheet = workbook.addWorksheet("Fiches", { views: [{ state: "frozen", ySplit: 1 }] });
      sheet.columns = fields.map((key, index) => ({
        key,
        header: labels[index],
        width: key === "display_name" ? 34 : key === "id" || key.endsWith("_id") ? 40 : 26,
      }));
      for (const row of cells) {
        if (row.some((cell) => typeof cell === "string" && cell.length > 32767))
          throw new ApiError(
            "Un champ dépasse la capacité d’une cellule Excel. Choisissez JSON ou retirez cette colonne.",
            413,
          );
        // Strings remain literal strings: no formulas, links or numeric ID conversion.
        const excelRow = row.map((cell, index) => {
          const key = fields[index];
          const attr = key.startsWith("attr_")
            ? attributes?.find((a) => a.key === key.slice(5))
            : null;
          const numeric =
            key === "amount" || (attr && (attr.type === "number" || attr.type === "money"));
          // Excel stores 15 significant digits; larger values remain exact text.
          if (
            numeric &&
            typeof cell === "string" &&
            /^-?\d+(\.\d+)?$/.test(cell) &&
            cell.replace(/[^0-9]/g, "").replace(/^0+/, "").length <= 15
          )
            return Number(cell);
          return cell;
        });
        sheet.addRow(excelRow);
      }
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3557CF" } };
      sheet.getRow(1).height = 26;
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, rows.length + 1), column: fields.length },
      };
      return download(
        new Uint8Array(await workbook.xlsx.writeBuffer()),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename,
      );
    }
    const safe = cells.map((row) =>
      row.map((value) =>
        typeof value === "number" || typeof value === "boolean"
          ? value
          : /^\s*[=+@-]/.test(String(value))
            ? "'" + String(value)
            : safeCsvCell(value),
      ),
    );
    const text = Papa.unparse(
      {
        fields: labels.map((label) =>
          /^\s*[=+@-]/.test(label) ? "\u0027" + label : safeCsvCell(label),
        ),
        data: safe,
      },
      { delimiter: format === "tsv" ? "\t" : delimiter, newline: "\r\n" },
    );
    return download(
      "\uFEFF" + text,
      format === "tsv" ? "text/tab-separated-values; charset=utf-8" : "text/csv; charset=utf-8",
      filename,
    );
  } catch (e) {
    return fail(e);
  }
}
