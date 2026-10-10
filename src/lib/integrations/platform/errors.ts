export const errorCodes = [
  "unauthorized",
  "forbidden",
  "insufficient_scope",
  "token_expired",
  "token_revoked",
  "rate_limited",
  "not_found",
  "conflict",
  "provider_unavailable",
  "validation_error",
  "unsupported",
  "confirmation_required",
  "unknown",
] as const;
export type IntegrationErrorCode = (typeof errorCodes)[number];
const messages: Record<IntegrationErrorCode, string> = {
  unauthorized: "Reconnectez ce compte pour continuer.",
  forbidden: "Ce compte ne peut pas effectuer cette action.",
  insufficient_scope: "Accordez les permissions nécessaires à cette fonctionnalité.",
  token_expired: "La connexion doit être renouvelée.",
  token_revoked: "Le fournisseur a révoqué cette connexion.",
  rate_limited: "La limite du fournisseur est atteinte. Réessayez plus tard.",
  not_found: "Cette ressource n’existe plus ou n’est pas accessible.",
  conflict: "Cette ressource a changé. Actualisez-la.",
  provider_unavailable: "Le fournisseur est temporairement indisponible.",
  validation_error: "Les paramètres de cette action sont invalides.",
  unsupported: "Cette fonctionnalité n’est pas disponible pour cette connexion.",
  confirmation_required: "Confirmez cette action avant son exécution.",
  unknown: "L’intégration n’a pas pu terminer cette action.",
};
export class IntegrationError extends Error {
  constructor(
    public code: IntegrationErrorCode,
    public status = 400,
    public retryAfter?: number,
  ) {
    super(messages[code]);
  }
  get retryable() {
    return this.code === "rate_limited" || this.code === "provider_unavailable";
  }
}
export function normalizeError(error: unknown) {
  if (error instanceof IntegrationError)
    return { code: error.code, retryable: error.retryable, retryAfter: error.retryAfter };
  return { code: "unknown", retryable: false };
}
export function retryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value) : (Date.parse(value) - now) / 1000;
  return Number.isFinite(seconds) ? Math.max(1, Math.min(3600, Math.ceil(seconds))) : undefined;
}
export function retryDelay(attempt: number, header?: number, random = Math.random()) {
  return Math.max(
    header ?? 0,
    Math.min(3600, 2 ** Math.min(12, Math.max(0, attempt))) +
      Math.floor(Math.max(0, Math.min(1, random)) * 10),
  );
}
