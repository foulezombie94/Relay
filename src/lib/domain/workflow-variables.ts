import type { CrmRecord } from "./types";

export type WorkflowValues = Record<string, unknown>;
const token = /\{\{\s*([a-zA-Z0-9_.-]{1,160})\s*\}\}/g;
export function readVariable(values: WorkflowValues, path: string): unknown {
  let current: unknown = values;
  const keys = path.split(".");
  if (keys.length > 8 || keys.some((k) => ["__proto__", "prototype", "constructor"].includes(k)))
    return undefined;
  for (const key of keys) {
    if (!current || typeof current !== "object" || !Object.hasOwn(current, key)) return undefined;
    current = (current as WorkflowValues)[key];
  }
  return current;
}
export function renderWorkflowText(text: string, values: WorkflowValues, max = 10000): string {
  const result = text.replace(token, (_, key: string) => {
    const value = readVariable(values, key);
    if (value === undefined || value === null || typeof value === "object")
      throw new Error(`Variable non disponible : ${key}`);
    return String(value);
  });
  if (result.length > max) throw new Error("Le contenu dépasse la limite autorisée.");
  return result;
}
export function recordValues(record: CrmRecord, extra: WorkflowValues = {}): WorkflowValues {
  const enriched = {
    ...record,
    name: record.display_name,
    first_name: record.attributes.first_name ?? record.display_name.split(" ")[0],
  };
  return {
    record: enriched,
    contact: enriched,
    company: enriched,
    deal: enriched,
    steps: {},
    event: {},
    ...extra,
  };
}
export const workflowVariables = [
  "record.name",
  "record.email",
  "contact.first_name",
  "company.name",
  "deal.amount",
  "deal.stage",
  "event.subject",
  "event.body",
  "event.payload.nom_du_champ",
  "steps.analyse.intent",
  "steps.analyse.summary",
  "steps.analyse.next_action",
];
