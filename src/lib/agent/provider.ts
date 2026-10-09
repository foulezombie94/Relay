import "server-only";
import { configuredAgentProvider } from "./identity";
import type { toolsForModel } from "./contracts";

export function agentApiKey() {
  return configuredAgentProvider() === "groq"
    ? process.env.GROQ_API_KEY?.trim()
    : process.env.OPENAI_API_KEY?.trim();
}
export function agentEndpoint() {
  return configuredAgentProvider() === "groq"
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
}
// Groq's free tier cannot accept the full descriptive schemas. Only transport
// descriptions are shortened; names, parameters and backend Zod validation stay intact.
function compactSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compactSchema);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, entry]) => key !== "description" || typeof entry !== "string")
        .map(([key, entry]) => [key, compactSchema(entry)]),
    );
  return value;
}
export function agentProviderTools(tools: ReturnType<typeof toolsForModel>) {
  if (configuredAgentProvider() !== "groq") return tools;
  return tools.map((tool) => ({
    ...tool,
    function: {
      ...tool.function,
      parameters: compactSchema(tool.function.parameters),
    },
  }));
}
export function agentProviderOptions(exhausted: boolean) {
  if (configuredAgentProvider() !== "groq")
    return { store: false, response_format: { type: "json_object" } };
  return {
    store: false,
    include_reasoning: false,
    reasoning_effort: "low",
    // Groq rejects JSON mode together with tools, even when tool_choice is none.
    ...(exhausted ? { response_format: { type: "json_object" } } : {}),
  };
}
