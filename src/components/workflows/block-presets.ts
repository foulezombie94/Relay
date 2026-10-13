import type { WorkflowAction } from "@/lib/domain/types";
import { newWorkflowAction } from "@/lib/domain/workflow-templates";

/** Presets compile to existing, server-validated actions; they introduce no new privileges. */
export const blockPresets = [
  {
    id: "assign",
    name: "Attribuer la fiche",
    description: "Choisir le membre responsable de cette fiche.",
    type: "set_field",
    values: { field: "owner_id", value: undefined },
  },
  {
    id: "stage",
    name: "Changer l’étape",
    description: "Faire avancer l’opportunité dans son pipeline.",
    type: "set_field",
    values: { field: "stage", value: "Qualification" },
  },
  {
    id: "probability",
    name: "Définir la probabilité",
    description: "Mettre à jour la probabilité de conclusion.",
    type: "set_field",
    values: { field: "probability", value: "50" },
  },
  {
    id: "follow-up",
    name: "Planifier une relance",
    description: "Créer une tâche à trois jours pour le responsable de la fiche.",
    type: "task",
    values: { title: "Relancer {{record.name}}", days: 3, owner: "record" },
  },
  {
    id: "wait-reply",
    name: "Attendre une réponse email",
    description: "Reprendre à la réponse ; arrêter après sept jours sans réponse.",
    type: "wait_until",
    values: {
      wait_mode: "email_reply",
      conditions: undefined,
      timeout_minutes: 10080,
      timeout_behavior: "stop",
    },
  },
  {
    id: "wait-date",
    name: "Attendre une date précise",
    description: "Choisir quand reprendre, avec une attente maximale de sept jours.",
    type: "wait_until",
    values: {
      wait_mode: "date",
      until: "",
      conditions: undefined,
      timeout_minutes: 10080,
      timeout_behavior: "stop",
    },
  },
] satisfies {
  id: string;
  name: string;
  description: string;
  type: WorkflowAction["type"];
  values: Partial<WorkflowAction>;
}[];

export function createPreset(id: string): WorkflowAction | undefined {
  const preset = blockPresets.find((p) => p.id === id);
  return preset ? { ...newWorkflowAction(preset.type), ...preset.values } : undefined;
}

const fields: Record<string, string> = {
  stage: "Étape",
  owner_id: "Responsable",
  close_date: "Date de clôture",
  probability: "Probabilité",
};
export function blockSummary(action: WorkflowAction): string {
  switch (action.type) {
    case "task":
    case "commitment":
      return `${action.days ?? 1} j · ${action.owner === "runner" ? "Personne qui lance" : action.owner === "selected" ? "Responsable choisi" : "Responsable de la fiche"}`;
    case "set_field":
      return `${fields[action.field ?? ""] ?? "Information"} · ${action.value === undefined ? "À configurer" : action.field === "owner_id" ? (action.value ? "Membre sélectionné" : "Sans responsable") : action.value || "Effacer la valeur"}`;
    case "delay":
      return action.minutes && action.minutes % 1440 === 0
        ? `${action.minutes / 1440} jour(s) d’attente`
        : `${action.minutes ?? 0} minute(s) d’attente`;
    case "wait_until":
      return `${action.wait_mode === "email_reply" ? "Réponse email" : action.wait_mode === "date" ? "Date précise" : "Conditions remplies"} · délai maximal ${Math.ceil((action.timeout_minutes ?? 0) / 1440)} j`;
    case "branch":
      return `${action.conditions?.length ?? 0} condition(s) · ${action.condition_mode === "any" ? "OU" : "ET"} · Oui / Non`;
    case "email":
      return `${action.provider === "outlook" ? "Outlook" : "Gmail"} · compte connecté`;
    case "calendar":
      return `${action.provider === "outlook-calendar" ? "Outlook" : "Google Calendar"} · ${action.duration_minutes ?? 30} min`;
    case "add_to_list":
      return action.list_id ? "Liste sélectionnée" : "Choisir une liste";
    case "slack":
    case "webhook":
      return action.destination_id ? "Destination autorisée" : "Choisir une destination";
    case "ai":
      return "Analyse structurée · contexte limité";
    case "notify":
      return "Notification interne Zyliad";
    case "note":
      return "Note partagée sur la fiche";
  }
}
