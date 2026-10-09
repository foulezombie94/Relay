import type { Attribute } from "./types";

export const exportFormats = [
  {
    value: "xlsx",
    label: "Excel",
    extension: "xlsx",
    description: "Tableau mis en forme, filtres et en-tête figé.",
  },
  {
    value: "csv",
    label: "CSV",
    extension: "csv",
    description: "Compatible avec les CRM et Google Sheets.",
  },
  {
    value: "json",
    label: "JSON",
    extension: "json",
    description: "Données structurées pour vos outils et développeurs.",
  },
  {
    value: "tsv",
    label: "TSV",
    extension: "tsv",
    description: "Tableau texte avec colonnes séparées par tabulations.",
  },
] as const;
export type ExportFormat = (typeof exportFormats)[number]["value"];
export type ExportField = { key: string; label: string };
export function recordExportFields(
  slug: string,
  attributes: Pick<Attribute, "key" | "name">[],
): ExportField[] {
  return [
    { key: "id", label: "Identifiant Relay" },
    { key: "display_name", label: "Nom" },
    { key: "email", label: "Email" },
    { key: "domain", label: "Site internet" },
    { key: "owner_id", label: "Identifiant du responsable" },
    ...(slug === "deals"
      ? [
          { key: "stage", label: "Étape" },
          { key: "amount", label: "Montant" },
          { key: "currency", label: "Devise" },
          { key: "pipeline_id", label: "Identifiant du pipeline" },
          { key: "probability", label: "Probabilité spécifique (%)" },
          { key: "close_date", label: "Date de clôture prévue" },
          { key: "lost_reason", label: "Raison de perte" },
        ]
      : [{ key: "stage", label: "Statut" }]),
    { key: "created_at", label: "Date de création" },
    { key: "updated_at", label: "Dernière modification" },
    ...attributes.map((a) => ({ key: "attr_" + a.key, label: a.name })),
  ];
}
