import "server-only";
import { configuredAgentProvider } from "./identity";
import { ApiError } from "@/lib/api/context";

export function retryAfterSeconds(headers: Headers, now = Date.now()) {
  const value = headers.get("retry-after");
  if (!value) return undefined;
  const seconds = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : (Date.parse(value) - now) / 1000;
  return Number.isFinite(seconds) ? Math.min(86400, Math.max(1, Math.ceil(seconds))) : undefined;
}
const MODEL_CODES = new Set(["model_not_found", "model_decommissioned", "model_terms_required"]);
export function providerFailure(response: Response, providerCode?: string | boolean) {
  const status = response.status;
  const code = typeof providerCode === "string" ? providerCode : undefined;
  const exhaustedQuota = providerCode === true || code === "insufficient_quota";
  if (code && MODEL_CODES.has(code))
    return Object.assign(
      new ApiError(
        "Le modèle IA configuré est indisponible chez le fournisseur. Vérifiez GROQ_MODEL ou OPENAI_MODEL.",
        502,
      ),
      { code: "provider_model_unavailable", retryAfter: undefined },
    );
  if (code === "tool_use_failed")
    return Object.assign(
      new ApiError(
        "Le modèle IA a produit un appel d’outil invalide. Relancez la question ou reformulez-la.",
        502,
      ),
      { code: "provider_tool_call_invalid", retryAfter: undefined },
    );
  return Object.assign(
    new ApiError(
      status === 429
        ? exhaustedQuota
          ? "Le quota du fournisseur IA est épuisé. Vérifiez son offre et sa facturation."
          : "Le fournisseur IA limite temporairement les demandes. Réessayez après le délai indiqué."
        : [401, 403].includes(status)
          ? "La connexion au fournisseur IA est mal configurée. Contactez votre administrateur."
          : status === 400 || status === 404 || status === 422
            ? "Le fournisseur IA a refusé cette requête. Contactez votre administrateur."
            : "Le fournisseur IA est temporairement indisponible. Réessayez.",
      status === 429 ? 429 : 502,
    ),
    {
      code:
        status === 429
          ? exhaustedQuota
            ? "provider_quota_exhausted"
            : "provider_rate_limited"
          : "provider_failed",
      retryAfter: retryAfterSeconds(response.headers),
    },
  );
}

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
export function agentProviderTools(
  tools: Array<{
    type: string;
    function: { name: string; description: string; parameters: unknown };
  }>,
) {
  if (configuredAgentProvider() !== "groq") return tools;
  return tools.map((tool) => ({
    ...tool,
    function: {
      ...tool.function,
      parameters: compactSchema(tool.function.parameters),
    },
  }));
}
export function agentUsageCost(input: number, output: number) {
  const rate = (name: string, fallback: number) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value >= 0 && process.env[name]?.trim() ? value : fallback;
  };
  return Math.ceil(
    input * rate("AGENT_INPUT_USD_PER_MILLION", 0.4) +
      output * rate("AGENT_OUTPUT_USD_PER_MILLION", 1.6),
  );
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
