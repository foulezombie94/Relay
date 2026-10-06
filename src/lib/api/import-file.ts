import "server-only";
import { csvTable, type ImportTable } from "@/lib/domain/imports";
import { checkXlsxBudget } from "./xlsx-budget";
export async function readImportFile(file: File): Promise<ImportTable> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Fichier limité à 5 Mo.");
  if (/\.csv$/i.test(file.name)) return csvTable(await file.text());
  if (!/\.xlsx$/i.test(file.name))
    throw new Error("Choisissez un fichier CSV ou Excel .xlsx.");
  const data = Buffer.from(await file.arrayBuffer());
  await checkXlsxBudget(data);
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Classeur sans feuille.");
  if (sheet.rowCount > 1001 || sheet.columnCount > 100)
    throw new Error(
      "Maximum 1 000 lignes et 100 colonnes sur la première feuille.",
    );
  const cellValue = (cell: import("exceljs").Cell) => {
    const value = cell.value;
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === "object" && "formula" in value)
      throw new Error(
        "Les formules Excel doivent être remplacées par leurs valeurs avant import.",
      );
    return cell.text;
  };
  const headers = Array.from({ length: sheet.columnCount }, (_, i) =>
    cellValue(sheet.getRow(1).getCell(i + 1)).trim(),
  );
  if (
    !headers.length ||
    headers.some((h) => !h) ||
    new Set(headers).size !== headers.length
  )
    throw new Error("Chaque colonne doit avoir un nom unique et non vide.");
  const rows = Array.from({ length: sheet.rowCount - 1 }, (_, i) =>
    Array.from({ length: headers.length }, (_, j) =>
      cellValue(sheet.getRow(i + 2).getCell(j + 1)),
    ),
  ).filter((row) => row.some(Boolean));
  if (!rows.length) throw new Error("Aucune ligne à importer.");
  return { headers, rows };
}
