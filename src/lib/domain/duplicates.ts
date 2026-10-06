import type { CrmRecord } from "./types";
export type DuplicateGroup = {
  key: string;
  reason: string;
  strength: "fort" | "à examiner";
  records: CrmRecord[];
};
function name(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
function domain(s: string | null) {
  if (!s) return "";
  try {
    return new URL(s.includes("://") ? s : "https://" + s).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return "";
  }
}
export function duplicateGroups(records: CrmRecord[]): DuplicateGroup[] {
  const groups = new Map<string, DuplicateGroup>();
  for (const r of records) {
    const signals: [string, string, string, DuplicateGroup["strength"]][] = [
      [
        "email",
        (r.email || "").trim().toLowerCase(),
        "Même adresse email",
        "fort",
      ],
      [
        "domain",
        domain(r.domain),
        "Même domaine (peut être partagé)",
        "à examiner",
      ],
      ["name", name(r.display_name), "Même nom normalisé", "à examiner"],
    ];
    for (const [kind, value, reason, strength] of signals) {
      if (value.length < 3) continue;
      const key = r.object_id + ":" + kind + ":" + value;
      const g = groups.get(key) ?? { key, reason, strength, records: [] };
      g.records.push(r);
      groups.set(key, g);
    }
  }
  return [...groups.values()]
    .filter((g) => g.records.length > 1)
    .sort(
      (a, b) =>
        Number(b.strength === "fort") - Number(a.strength === "fort") ||
        a.key.localeCompare(b.key),
    );
}
export const mergeFields = [
  "display_name",
  "email",
  "domain",
  "stage",
  "amount",
  "currency",
  "owner_id",
  "close_date",
] as const;
export function mergeValues(
  source: CrmRecord,
  target: CrmRecord,
  picks: Record<string, "source" | "target">,
) {
  const values: Record<string, unknown> = { ...target };
  values.attributes = { ...source.attributes, ...target.attributes };
  for (const [key, choice] of Object.entries(picks)) {
    if (key.startsWith("attr:"))
      (values.attributes as Record<string, unknown>)[key.slice(5)] =
        (choice === "source" ? source : target).attributes[key.slice(5)] ??
        null;
    else values[key] = (choice === "source" ? source : target)[key];
  }
  return values;
}
