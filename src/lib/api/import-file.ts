import "server-only";
import { csvTable, type ImportTable } from "@/lib/domain/imports";
import { withFullName, type CrmSource } from "@/lib/domain/crm-migration";
import { checkXlsxBudget, readZipEntries } from "./xlsx-budget";
export type ImportSelection = { id: string; name: string };
type ReadOptions = {
  selection?: string;
  headerRow?: number;
  source?: CrmSource;
};
export const MAX_IMPORT_BYTES = 4_000_000;
function jsonCollections(content: string, source: CrmSource) {
  const parsed: unknown = JSON.parse(content);
  const collections: { name: string; items: Record<string, unknown>[] }[] = [];
  function add(name: string, value: unknown) {
    if (!Array.isArray(value)) return;

    if (value.some((v) => !v || typeof v !== "object" || Array.isArray(v)))
      throw new Error("Chaque ligne JSON doit être un objet.");
    if (value.length) collections.push({ name, items: value as Record<string, unknown>[] });
  }
  if (Array.isArray(parsed)) add("Fiches", parsed);
  else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    for (const key of [
      "data",
      "records",
      "leads",
      "contacts",
      "people",
      "companies",
      "accounts",
      "deals",
      "opportunities",
    ])
      add(key, obj[key]);
  }
  if (!collections.length)
    throw new Error(
      "JSON attendu : tableau de fiches, ou objet contenant data / records / leads / contacts / opportunities.",
    );
  if (source === "close") {
    const parents = collections
      .flatMap((c) => c.items)
      .filter((r) => Array.isArray(r.contacts) || Array.isArray(r.opportunities));
    if (parents.length) {
      add(
        "Contacts des leads",
        parents.flatMap((p) =>
          Array.isArray(p.contacts)
            ? p.contacts.map((c) => ({ ...(c as object), lead_id: p.id }))
            : [],
        ),
      );
      add(
        "Opportunités des leads",
        parents.flatMap((p) =>
          Array.isArray(p.opportunities)
            ? p.opportunities.map((c) => ({ ...(c as object), lead_id: p.id }))
            : [],
        ),
      );
    }
  }
  return collections.map((c) => ({
    name: c.name,
    table: () => jsonTable(c.items, source),
  }));
}
function jsonTable(items: Record<string, unknown>[], source: CrmSource): ImportTable {
  if (items.length > 1000)
    throw new Error("Maximum 1 000 fiches par collection. Découpez votre export.");
  const flat = items.map((item) => {
    const row: Record<string, string> = Object.create(null);
    for (const [key, value] of Object.entries(item)) {
      if (
        ["__proto__", "constructor", "prototype"].includes(key) ||
        ["contacts", "opportunities", "activities"].includes(key)
      )
        continue;
      if (value === null || value === undefined) row[key] = "";
      else if (["string", "number", "boolean"].includes(typeof value)) row[key] = String(value);
      else if (key === "emails" && Array.isArray(value))
        row.email = String(value[0]?.email ?? value[0] ?? "");
      else if (key === "status" && typeof value === "object" && !Array.isArray(value))
        row.status_label = String((value as Record<string, unknown>).label ?? "");
      else if (key === "custom" && typeof value === "object" && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value as object))
          if (!["__proto__", "constructor", "prototype"].includes(k))
            row["custom." + k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
      } else row[key] = JSON.stringify(value);
    }
    // Close's API JSON expresses opportunity value in cents, unlike CSV exports.
    if (
      source === "close" &&
      item.value !== undefined &&
      item.value_currency !== undefined &&
      typeof item.value === "number"
    )
      row.value = String(item.value / 100);
    return row;
  });
  const headers = [...new Set(flat.flatMap((r) => Object.keys(r)))];
  if (headers.length > 100 || headers.some((h) => h.length > 200))
    throw new Error("Maximum 100 colonnes de 200 caractères.");
  const rows = flat.map((r) => headers.map((h) => r[h] ?? ""));
  return withFullName({ headers, rows, rowNumbers: rows.map((_, i) => i + 1) });
}
async function workbookTables(data: Buffer, headerRow: number) {
  await checkXlsxBudget(data);
  const ExcelJS = await import("exceljs");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
  );
  return book.worksheets.map((sheet) => ({
    name: sheet.name,
    table: () => {
      if (sheet.rowCount - headerRow > 1000 || sheet.columnCount > 100)
        throw new Error("Maximum 1 000 lignes et 100 colonnes par feuille.");
      const cellText = (cell: import("exceljs").Cell) => {
        const v = cell.value;
        if (v == null) return "";
        if (typeof v === "number" && Number.isInteger(v) && !Number.isSafeInteger(v))
          throw new Error(
            "Nombre ou identifiant Excel trop long : utilisez une cellule texte ou un export CSV.",
          );
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (typeof v === "object" && ("formula" in v || "sharedFormula" in v))
          throw new Error("Remplacez les formules Excel par leurs valeurs avant import.");
        return cell.text;
      };
      const headers = Array.from({ length: sheet.columnCount }, (_, i) =>
        cellText(sheet.getRow(headerRow).getCell(i + 1)).trim(),
      );
      if (
        !headers.length ||
        headers.some((h) => !h || h.length > 200) ||
        new Set(headers).size !== headers.length
      )
        throw new Error(
          "Choisissez la ligne d’en-tête : chaque colonne doit avoir un nom unique et non vide.",
        );
      const rawRows = Array.from({ length: Math.max(0, sheet.rowCount - headerRow) }, (_, i) =>
        headers.map((_, j) => cellText(sheet.getRow(headerRow + i + 1).getCell(j + 1))),
      );
      const rowNumbers = rawRows.flatMap((r, i) => (r.some(Boolean) ? [headerRow + i + 1] : []));
      const rows = rawRows.filter((r) => r.some(Boolean));
      if (!rows.length) throw new Error("Cette feuille ne contient aucune fiche.");
      return withFullName({ headers, rows, rowNumbers });
    },
  }));
}
export async function inspectImportFile(file: File, options: ReadOptions = {}) {
  if (file.size > MAX_IMPORT_BYTES)
    throw new Error("Fichier limité à 4 Mo. Découpez les gros exports ou extrayez un CSV du ZIP.");
  if (!file.size) throw new Error("Le fichier est vide.");
  const source = options.source ?? "file",
    headerRow = options.headerRow ?? 1;
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > 25)
    throw new Error("La ligne d’en-tête doit être comprise entre 1 et 25.");
  const entries = /\.zip$/i.test(file.name)
    ? await readZipEntries(Buffer.from(await file.arrayBuffer()))
    : [{ name: file.name, data: Buffer.from(await file.arrayBuffer()) }];
  const tables: { name: string; table: () => ImportTable }[] = [];
  const ignored: string[] = [];
  for (const entry of entries) {
    if (entry.name.endsWith("/")) continue;
    if (/\.csv$/i.test(entry.name))
      tables.push({
        name: entry.name,
        table: () => withFullName(csvTable(entry.data.toString("utf8"))),
      });
    else if (/\.json$/i.test(entry.name)) {
      try {
        for (const c of jsonCollections(entry.data.toString("utf8"), source))
          tables.push({ name: entry.name + " · " + c.name, table: c.table });
      } catch (e) {
        if (!/\.zip$/i.test(file.name)) throw e;
        ignored.push(entry.name + " — JSON hors du format de fiches pris en charge");
      }
    } else if (/\.xlsx$/i.test(entry.name)) {
      if (/\.zip$/i.test(file.name))
        ignored.push(entry.name + " — classeur Excel : importez-le séparément");
      else
        for (const t of await workbookTables(entry.data, headerRow))
          tables.push({ name: entry.name + " · " + t.name, table: t.table });
    } else ignored.push(entry.name);
  }
  if (!tables.length)
    throw new Error(
      "Aucune table exploitable : choisissez CSV, Excel .xlsx, JSON ou un ZIP contenant ces fichiers. Les fichiers .xls doivent être enregistrés en .xlsx.",
    );
  const selections = tables.map((t, i) => ({ id: String(i), name: t.name }));
  const selected = options.selection ?? (tables.length === 1 ? "0" : undefined);
  if (selected === undefined) return { selections, ignored, table: null, selection: null };
  if (!/^\d{1,3}$/.test(selected) || !tables[Number(selected)])
    throw new Error("Choisissez un fichier ou une feuille dans la liste.");
  return {
    selections,
    ignored,
    table: tables[Number(selected)].table(),
    selection: selected,
  };
}
export async function readImportFile(file: File): Promise<ImportTable> {
  const result = await inspectImportFile(file, { selection: "0" });
  return result.table!;
}
