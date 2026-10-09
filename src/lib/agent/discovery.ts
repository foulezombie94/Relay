import { z } from "zod";
import { toolSchemas, toolsForModel, type ToolName } from "./contracts";

const names = Object.keys(toolSchemas) as [ToolName, ...ToolName[]];
const base: ToolName[] = [
  "search_records",
  "search_emails",
  "search_tasks",
  "get_record",
  "get_source",
  "aggregate_crm_data",
  "get_action_status",
];
export const discoveryInput = z.object({ names: z.array(z.enum(names)).min(1).max(6) }).strict();
const discover = {
  type: "function",
  function: {
    name: "discover_tools",
    description:
      "Rendre disponibles jusqu’à six outils métier supplémentaires pour les prochains appels. Cette opération ne lit ni ne modifie aucune donnée CRM et ne donne aucune autorisation.",
    parameters: z.toJSONSchema(discoveryInput, { io: "input" }),
  },
};
export const discoveryInstructions =
  "Les outils sont chargés progressivement. Appelle discover_tools pour obtenir les outils nécessaires avant de les utiliser. Le catalogue complet reste disponible : " +
  names.join(", ") +
  ". La découverte ne remplace jamais les contrôles d’accès ou confirmations.";

export function progressiveTools() {
  let extra: ToolName[] = [];
  return {
    definitions: () => [...toolsForModel([...base, ...extra]), discover],
    allows: (name: string) =>
      name === "discover_tools" ||
      base.includes(name as ToolName) ||
      extra.includes(name as ToolName),
    discover: (raw: unknown) => {
      extra = [...new Set(discoveryInput.parse(raw).names)].filter((name) => !base.includes(name));
      return { available_tools: [...base, ...extra], changed: true, data_access: false };
    },
  };
}
