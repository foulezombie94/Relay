import type { Attribute, CrmRecord } from "@/lib/domain/types";
export type ContactColumn = {
  key: string;
  label: string;
  type: string;
  options?: string[];
  attribute?: Attribute;
};
export function contactColumns(attributes: Attribute[], slug?: string): ContactColumn[] {
  return [
    { key: "display_name", label: "Nom", type: "text" },
    { key: "email", label: "E-mail", type: "email" },
    { key: "domain", label: "Site", type: "url" },
    ...(["people", "companies"].includes(slug ?? "")
      ? [
          {
            key: "relations",
            label: slug === "companies" ? "Contacts" : "Entreprises",
            type: "relation",
          },
        ]
      : []),
    ...attributes
      .filter((a) => !a.archived)
      .map((a) => ({
        key: "attr_" + a.key,
        label: a.name,
        type: a.type,
        options: a.options,
        attribute: a,
      })),
  ];
}
export function contactValue(record: CrmRecord, key: string): unknown {
  return key.startsWith("attr_") ? record.attributes?.[key.slice(5)] : record[key];
}
export function contactPatch(
  record: CrmRecord,
  column: ContactColumn,
  value: unknown,
): Record<string, unknown> {
  if (column.key.startsWith("attr_"))
    return { attributes: { ...record.attributes, [column.key.slice(5)]: value } };
  if (!["display_name", "email", "domain"].includes(column.key))
    throw new Error("Cette propriété ne peut pas être modifiée ici.");
  if (column.key === "display_name" && !String(value ?? "").trim())
    throw new Error("Le nom du contact est obligatoire.");
  return { [column.key]: String(value ?? "").trim() };
}
export function contactAttributeKey(name: string, existing: string[]) {
  let base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (!/^[a-z]/.test(base)) base = "champ_" + base;
  let key = base;
  for (let n = 2; existing.includes(key); n++) key = base + "_" + n;
  return key;
}
