import type { Attribute, CrmRecord } from "@/lib/domain/types";
import type { StudioInput, StudioKind } from "@/lib/domain/record-studio";
import { defaultLayout } from "@/lib/domain/record-studio";
export type StudioField = {
  key: string;
  label: string;
  type: string;
  options: string[];
  required?: boolean;
};
export const sectionNames: Record<string, string> = {
  overview: "Aperçu",
  relations: "Relations",
  timeline: "Historique",
  notes: "Notes",
  tasks: "Tâches",
  commitments: "Engagements",
  activities: "Activité",
  documents: "Documents",
  contacts: "Contacts liés",
  deals: "Opportunités liées",
};
export function studioFields(attrs: Attribute[]): StudioField[] {
  return [
    { key: "display_name", label: "Nom", type: "text", options: [] },
    { key: "email", label: "E-mail", type: "email", options: [] },
    { key: "domain", label: "Site internet", type: "text", options: [] },
    { key: "owner_id", label: "Responsable", type: "user", options: [] },
    { key: "stage", label: "Étape", type: "text", options: [] },
    { key: "amount", label: "Montant", type: "number", options: [] },
    { key: "currency", label: "Devise", type: "text", options: [] },
    { key: "close_date", label: "Date de clôture", type: "date", options: [] },
    ...attrs
      .filter((a) => !a.archived)
      .map((a) => ({
        key: "attr_" + a.key,
        label: a.name,
        type: a.type,
        options: a.options,
        required: a.required,
      })),
  ];
}
export function questionType(field: StudioField) {
  return ({ money: "number", boolean: "checkbox", phone: "text", location: "text" }[field.type] ??
    field.type) as "number" | "checkbox" | "email" | "url" | "date" | "select" | "text";
}
export function formFields(fields: StudioField[]) {
  return fields.filter(
    (f) =>
      !["stage", "owner_id", "currency"].includes(f.key) &&
      [
        "text",
        "email",
        "url",
        "phone",
        "location",
        "number",
        "money",
        "boolean",
        "date",
        "select",
      ].includes(f.type),
  );
}
export function fieldValue(record: CrmRecord, field: string) {
  return field.startsWith("attr_") ? record.attributes[field.slice(5)] : record[field];
}
export function newStudioConfig(
  kind: StudioKind,
  target: string,
  fields: StudioField[],
): StudioInput["config"] {
  switch (kind) {
    case "layout":
      return {
        ...defaultLayout,
        groups: [
          ...defaultLayout.groups,
          ...(fields.some((f) => f.key.startsWith("attr_"))
            ? [
                {
                  id: "custom",
                  title: "Informations complémentaires",
                  fields: fields.filter((f) => f.key.startsWith("attr_")).map((f) => f.key),
                },
              ]
            : []),
        ],
      };
    case "relation":
      return {
        target_object_id: target,
        inverse: true,
        inverse_name: "Liens réciproques",
        multiple: true,
        inverse_multiple: true,
      };
    case "rollup":
      return { relation_id: "", relation_side: "source", calculation: "count" };
    case "button":
      return { workflow_id: "", confirmation: "Vérifiez les actions avant de confirmer." };
    case "template":
      return {
        values: {},
        content: "",
        checklist: [],
        repeat: "none",
        repeat_start: null,
        timezone: "Europe/Paris",
      };
    case "form":
      return {
        description: "",
        questions: [
          {
            id: crypto.randomUUID(),
            property: "display_name",
            label: "Votre nom",
            description: "",
            type: "text",
            required: true,
            options: [],
            show_if: null,
          },
        ],
        published: false,
        submit_label: "Envoyer",
        success_message: "Merci, votre réponse a été enregistrée.",
      };
  }
}
export function localInZone(iso: string | null, zone: string) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function zonedIso(value: string, zone: string) {
  if (!value) return null;
  const intended = Date.parse(value + "Z");
  let candidate = intended;
  for (let i = 0; i < 3; i++)
    candidate += intended - Date.parse(localInZone(new Date(candidate).toISOString(), zone) + "Z");
  const iso = new Date(candidate).toISOString();
  if (localInZone(iso, zone) !== value)
    throw new Error("Cette heure n’existe pas dans ce fuseau horaire.");
  return iso;
}
