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
      "Ajouter jusqu’à six outils métier par découverte pour les prochains appels. Les outils déjà chargés restent disponibles. Cette opération ne lit ni ne modifie aucune donnée CRM et ne donne aucune autorisation.",
    parameters: z.toJSONSchema(discoveryInput, { io: "input" }),
  },
};
export function discoveryInstructionsFor(allowedTools: readonly ToolName[] = names) {
  if (!allowedTools.length)
    return "Aucun outil métier n’est autorisé pour cette méthode. Travaille uniquement sur les informations fournies dans la demande, sans lecture CRM ni effet métier.";
  return (
    "Les outils sont chargés progressivement. Appelle discover_tools pour obtenir les outils nécessaires avant de les utiliser. Le catalogue autorisé est : " +
    allowedTools.join(", ") +
    ". Demande au plus six outils par découverte ; les découvertes successives se cumulent sans retirer les outils déjà chargés. Ne charge que les outils utiles à l’objectif. La découverte ne remplace jamais les contrôles d’accès ou confirmations."
  );
}
export const discoveryInstructions = discoveryInstructionsFor();

export function progressiveTools(allowedTools?: readonly ToolName[]) {
  const allowed = new Set(allowedTools ?? names);
  if ([...allowed].some((name) => !Object.hasOwn(toolSchemas, name)))
    throw new Error("Unknown tool in allowed catalogue");
  const initial = base.filter((name) => allowed.has(name));
  const discovery = allowed.size
    ? {
        ...discover,
        function: {
          ...discover.function,
          parameters: z.toJSONSchema(
            z
              .object({
                names: z
                  .array(z.enum([...allowed] as [ToolName, ...ToolName[]]))
                  .min(1)
                  .max(6),
              })
              .strict(),
            { io: "input" },
          ),
        },
      }
    : undefined;
  let extra: ToolName[] = [];
  return {
    definitions: () => [
      ...toolsForModel([...initial, ...extra]),
      ...(discovery ? [discovery] : []),
    ],
    allows: (name: string) =>
      (name === "discover_tools" && !!discovery) ||
      initial.includes(name as ToolName) ||
      extra.includes(name as ToolName),
    discover: (raw: unknown) => {
      const parsed = discoveryInput.parse(raw).names;
      if (parsed.some((name) => !allowed.has(name)))
        throw new Error("Tool outside allowed catalogue");
      const requested = parsed.filter((name) => !initial.includes(name));
      const next = [...new Set([...extra, ...requested])];
      const changed = next.length !== extra.length;
      extra = next;
      return { available_tools: [...initial, ...extra], changed, data_access: false };
    },
  };
}
