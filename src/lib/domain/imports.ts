import Papa from "papaparse";
import { resources } from "@/lib/api/resources";
import { validateAttributes } from "./attributes";
import { migrationFields, referenceIds } from "./crm-migration";
import type { Attribute } from "./types";
export const importFields = [
  "display_name",
  "email",
  "domain",
  "stage",
  "amount",
  "currency",
  "close_date",
  "lost_reason",
  "probability",
  "attributes",
] as const;
export type ImportTable = {
  headers: string[];
  rows: string[][];
  rowNumbers?: number[];
};
export type ImportError = { line: number; message: string };
export function csvTable(content: string): ImportTable {
  const result = Papa.parse<string[]>(content.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
  });
  if (result.errors.length)
    throw new Error("CSV mal formé : " + result.errors[0].message);
  const headers = (result.data[0] ?? []).map((h) => h.trim());
  if (
    !headers.length ||
    headers.some((h) => !h) ||
    new Set(headers).size !== headers.length
  )
    throw new Error("Chaque colonne doit avoir un nom unique et non vide.");
  if (headers.length > 100) throw new Error("Maximum 100 colonnes.");
  const rows = result.data.slice(1);
  if (rows.length > 1000) throw new Error("Maximum 1 000 lignes.");
  if (!rows.length)
    throw new Error("Le fichier ne contient aucune ligne à importer.");
  if (rows.some((r) => r.length > headers.length))
    throw new Error("Certaines lignes contiennent trop de colonnes.");
  return { headers, rows };
}
export function automaticMapping(headers: string[]) {
  const aliases: Record<string, string> = {
    nom: "display_name",
    name: "display_name",
    fullname: "display_name",
    nomcomplet: "display_name",
    entreprise: "display_name",
    societe: "display_name",
    companyname: "display_name",
    courriel: "email",
    adresseemail: "email",
    e_mail: "email",
    website: "domain",
    site: "domain",
    siteinternet: "domain",
    domaine: "domain",
    etape: "stage",
    montant: "amount",
    valeur: "amount",
    devise: "currency",
    datedecloture: "close_date",
    closedate: "close_date",
    raisondeperte: "lost_reason",
    probabilite: "probability",
  };
  return Object.fromEntries(
    headers.map((h) => {
      const normalized = h
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\s_-]/g, "");
      const known = importFields.find(
        (f) => f.replaceAll("_", "") === normalized,
      );
      return [
        h,
        known || aliases[normalized] || (h.startsWith("attr_") ? h : ""),
      ];
    }),
  );
}
export function importedNumber(value: string, format: "comma" | "dot") {
  let normalized = value.trim().replace(/[\s\u00A0\u202F]/g, "");
  if (format === "comma" && normalized.includes(","))
    normalized = normalized.replaceAll(".", "").replace(",", ".");
  if (format === "dot") normalized = normalized.replaceAll(",", "");
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(normalized))
    throw new Error("Nombre invalide : choisissez le bon format décimal.");
  return normalized;
}
function importedDate(value: string) {
  const raw = value.trim();
  const french = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  const iso = french ? `${french[3]}-${french[2]}-${french[1]}` : raw;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(iso) ||
    Number.isNaN(Date.parse(iso + "T00:00:00Z")) ||
    new Date(iso + "T00:00:00Z").toISOString().slice(0, 10) !== iso
  )
    throw new Error("Date invalide : utilisez JJ/MM/AAAA ou AAAA-MM-JJ.");
  return iso;
}
export function prepareImport(
  table: ImportTable,
  mapping: Record<string, string>,
  attributes: Attribute[],
  objectId: string,
  pipelineId: string | undefined,
  numberFormat: "comma" | "dot",
  options: {
    sourceKey?: string;
    stageMap?: Record<string, string>;
    deal?: boolean;
  } = {},
) {
  const allowed = new Set<string>([
    ...importFields,
    ...migrationFields,
    ...attributes
      .filter(
        (a) => !a.archived && !["formula", "relation", "user"].includes(a.type),
      )
      .map((a) => "attr_" + a.key),
  ]);
  const targets = Object.values(mapping).filter(Boolean);
  if (
    targets.some((t) => !allowed.has(t)) ||
    Object.keys(mapping).some((h) => !table.headers.includes(h))
  )
    throw new Error("Correspondance de colonnes invalide.");
  if (new Set(targets).size !== targets.length)
    throw new Error("Un champ ne peut être associé à deux colonnes.");
  if (!targets.includes("display_name"))
    throw new Error("Associez une colonne au nom.");
  const valid: Record<string, unknown>[] = [];
  const errors: ImportError[] = [];
  table.rows.forEach((cells, index) => {
    try {
      const values: Record<string, unknown> = { object_id: objectId };
      const custom: Record<string, unknown> = Object.create(null);
      const migration: Record<string, unknown> = {};
      table.headers.forEach((header, i) => {
        const target = mapping[header];
        const cell = (cells[i] ?? "").trim();
        if (!target || !cell) return;
        if (target.startsWith("_")) {
          if (target === "_source_id") {
            if (cell.length > 200 || /[\x00-\x1f]/.test(cell))
              throw new Error("ID source invalide.");
            migration.id = cell;
          } else
            migration[target === "_company_ids" ? "companies" : "people"] =
              referenceIds(cell);
          return;
        }
        if (target === "attributes") {
          const data = JSON.parse(cell);
          if (
            !data ||
            typeof data !== "object" ||
            Array.isArray(data) ||
            Object.keys(data).some((k) =>
              ["__proto__", "prototype", "constructor"].includes(k),
            )
          )
            throw new Error("Attributs JSON invalides.");
          Object.assign(custom, data);
          return;
        }
        if (target.startsWith("attr_")) {
          const a = attributes.find((a) => a.key === target.slice(5))!;
          let value: unknown = cell;
          if (["number", "money"].includes(a.type))
            value = Number(importedNumber(cell, numberFormat));
          else if (a.type === "boolean") {
            if (!/^(true|false|oui|non|1|0)$/i.test(cell))
              throw new Error("Booléen invalide pour " + a.name);
            value = /^(true|oui|1)$/i.test(cell);
          } else if (a.type === "multi_select")
            value = cell.startsWith("[")
              ? JSON.parse(cell)
              : cell
                  .split(";")
                  .map((s) => s.trim())
                  .filter(Boolean);
          else if (a.type === "date") value = importedDate(cell);
          custom[a.key] = value;
          return;
        }
        values[target] =
          target === "amount"
            ? importedNumber(cell, numberFormat)
            : target === "probability"
              ? Number(importedNumber(cell, numberFormat))
              : target === "close_date"
                ? importedDate(cell)
                : target === "currency"
                  ? cell.toUpperCase()
                  : cell;
      });
      if (pipelineId) values.pipeline_id = pipelineId;
      if (values.domain && /^https?:\/\//i.test(String(values.domain)))
        values.domain = new URL(String(values.domain)).hostname;
      if (values.stage && options.stageMap) {
        const mapped = options.stageMap[String(values.stage)];
        if (!mapped && options.deal)
          throw new Error(
            "Associez l’étape « " + values.stage + " » à une étape Relay.",
          );
        if (mapped) values.stage = mapped;
      }
      if (options.deal && values.stage === "Perdu" && !values.lost_reason)
        values.lost_reason =
          "Import CRM : raison de perte non renseignée dans l’export";
      values.attributes = custom;
      values.stage ??= "Nouveau";
      values.currency ??= "EUR";
      if (values.stage === "Perdu" && !String(values.lost_reason ?? "").trim())
        throw new Error(
          "Raison de perte obligatoire pour une opportunité perdue.",
        );
      const parsed = resources.records.safeParse(values);
      if (!parsed.success)
        throw new Error(
          parsed.error.issues
            .map((i) =>
              i.path[0] === "email"
                ? "Email invalide : vérifiez l’adresse."
                : i.path.join(".") + " : " + i.message,
            )
            .join(" ; "),
        );
      const issues = validateAttributes(custom, attributes);
      if (issues.length) throw new Error(issues.join(" ; "));
      if ((migration.companies || migration.people) && !migration.id)
        throw new Error(
          "Associez l’ID source de cette fiche pour conserver ses relations.",
        );
      valid.push({
        ...parsed.data,
        ...(options.sourceKey && migration.id
          ? { _import: { source: options.sourceKey, ...migration } }
          : {}),
      });
    } catch (e) {
      errors.push({
        line: table.rowNumbers?.[index] ?? index + 2,
        message: e instanceof Error ? e.message : "Ligne invalide.",
      });
    }
  });
  return { valid, errors };
}
