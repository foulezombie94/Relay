import type { SkillManifest, SkillValues } from "./agent-skills";
export const skillVariables = [
  ["fiche.nom", "Nom de la fiche"],
  ["fiche.email", "E-mail de la fiche"],
  ["fiche.domaine", "Site de la fiche"],
  ["fiche.etape", "Étape CRM"],
  ["contact.nom", "Nom du contact"],
  ["entreprise.nom", "Nom de l’entreprise"],
  ["entreprise.domaine", "Site de l’entreprise"],
  ["opportunite.nom", "Nom de l’opportunité"],
  ["opportunite.montant", "Montant de l’opportunité"],
  ["opportunite.devise", "Devise"],
  ["opportunite.date_cloture", "Date de clôture"],
  ["aujourdhui", "Date du jour dans l’espace"],
] as const;
export type SkillBindings = Record<string, string>;
export type SkillPreview = {
  name: string;
  draft: boolean;
  ready: boolean;
  record: { id: string; label: string } | null;
  inputs: SkillValues;
  bindings: SkillBindings;
  missing: string[];
  issues: string[];
  instructions: string;
  steps: SkillManifest["steps"];
  resources: SkillManifest["resources"];
  tools: { name: string; effect: "read" | "write" | "external"; available: boolean }[];
  mode: "ask" | "review" | "auto";
};
const mentionPattern = () =>
  /@\[([^\]\n]{1,100})\]\(record:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;
export function skillMention(record: { id: string; display_name: string }) {
  return `@[${record.display_name.replace(/[\]\r\n]/g, " ").slice(0, 100)}](record:${record.id})`;
}
export function skillMentionIds(instructions: string) {
  return [
    ...new Set(
      Array.from(instructions.matchAll(mentionPattern()), (match) => match[2].toLowerCase()),
    ),
  ];
}
export function skillVariableNames(instructions: string) {
  return [
    ...new Set(
      Array.from(
        instructions.matchAll(/\{\{\s*([a-z][a-z0-9_.]{0,79})\s*\}\}/g),
        (match) => match[1],
      ),
    ),
  ];
}
export function previewSkillText(instructions: string, bindings: SkillBindings) {
  return instructions.replace(/\{\{\s*([a-z][a-z0-9_.]{0,79})\s*\}\}/g, (original, key: string) =>
    Object.hasOwn(bindings, key) ? bindings[key] : original,
  );
}
export function missingSkillInputs(manifest: SkillManifest, inputs: SkillValues) {
  return manifest.inputs
    .filter(
      (field) =>
        field.required &&
        (inputs[field.key] === undefined ||
          inputs[field.key] === null ||
          inputs[field.key] === "" ||
          (Array.isArray(inputs[field.key]) &&
            (inputs[field.key] as string[]).length < (field.min_items ?? 1))),
    )
    .map((field) => field.label);
}
