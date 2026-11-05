import { z } from "zod";

export const fieldChangeSchema = z.object({
  event_id: z.uuid(),
  at: z.string(),
  actor_id: z.string().nullable(),
  actor_name: z.string().nullable(),
  action: z.enum(["insert", "update", "delete"]),
  field: z.string(),
  before: z.unknown(),
  after: z.unknown(),
});
export type FieldChange = z.infer<typeof fieldChangeSchema>;

const fieldLabels: Record<string, string> = {
  display_name: "Nom",
  email: "Email",
  domain: "Domaine",
  stage: "Étape",
  amount: "Montant",
  currency: "Devise",
  owner_id: "Responsable",
  close_date: "Clôture prévue",
  pipeline_id: "Pipeline",
  probability: "Probabilité",
  lost_reason: "Raison de perte",
  archived: "Corbeille",
};
export function fieldLabel(field: string, attributes: { key: string; name: string }[] = []) {
  if (field.startsWith("attributes.")) {
    const key = field.slice(11);
    return attributes.find((a) => a.key === key)?.name ?? key;
  }
  return fieldLabels[field] ?? field;
}
/** Readable value for the history timeline; identifiers are resolved by the caller. */
export function historyValue(
  value: unknown,
  resolve?: (value: string) => string | undefined,
): string {
  if (value === null || value === undefined || value === "") return "Vide";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (Array.isArray(value))
    return value.map((item): string => historyValue(item, resolve)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  return resolve?.(text) ?? text;
}
/** Groups consecutive changes of one audit event into a single timeline entry. */
export function groupChanges(changes: FieldChange[]) {
  const groups: {
    event_id: string;
    at: string;
    actor: string;
    action: string;
    items: FieldChange[];
  }[] = [];
  for (const change of changes) {
    const last = groups.at(-1);
    if (last?.event_id === change.event_id) last.items.push(change);
    else
      groups.push({
        event_id: change.event_id,
        at: change.at,
        actor: change.actor_name || (change.actor_id ? "Membre retiré" : "Automatisation"),
        action: change.action,
        items: [change],
      });
  }
  return groups;
}
