import { z } from "zod";

export const assistantApprovalMode = z.enum(["ask", "review", "auto"]);
export type AssistantApprovalMode = z.infer<typeof assistantApprovalMode>;

export const assistantApprovalOptions = [
  {
    value: "ask",
    label: "Toujours me consulter",
    description: "Valider chaque modification ou envoi avant son exécution.",
  },
  {
    value: "review",
    label: "Vérifier pour moi",
    description:
      "Avancer sur les tâches simples. Me consulter pour les envois et les actions sensibles.",
  },
  {
    value: "auto",
    label: "Avancer en autonomie",
    description: "Effectuer les actions disponibles sans demander de validation.",
  },
] as const satisfies readonly {
  value: AssistantApprovalMode;
  label: string;
  description: string;
}[];

// Modes never change workspace rights. Autonomy is an explicit delegation,
// confirmed in the composer, executed through the exact action preview below.
export function approvalAllowsAutomatic(mode: AssistantApprovalMode | undefined, kind: string) {
  if (mode === "ask") return false;
  if (mode === "review" && (kind === "draft_email" || kind.endsWith("calendar_event")))
    return false;
  return true;
}
