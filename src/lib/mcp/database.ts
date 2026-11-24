import "server-only";
import { createHash } from "node:crypto";
import { adminDb } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api/context";
import { mcpResource } from "./config";
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export async function oauthDb(operation: string, payload: Record<string, unknown>) {
  const { data, error } = await adminDb().rpc("mcp_oauth", { operation, payload });
  if (error) throw new ApiError("Service MCP temporairement indisponible.", 503);
  if (data?.error)
    throw new ApiError(
      "Autorisation MCP refusée ou expirée.",
      data.error === "rate_limited" ? 429 : 400,
      data.error,
    );
  return data;
}
export function bearer(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  if (!/^Bearer zmc_a_[A-Za-z0-9_-]{43}$/.test(value))
    throw new ApiError("Authentification OAuth requise.", 401);
  return hash(value.slice(7));
}
export async function mcpDb(tokenHash: string, operation: string, payload: unknown = {}) {
  const { data, error } = await adminDb()
    .rpc("mcp_request", {
      token_hash: tokenHash,
      operation,
      payload: { ...(payload as Record<string, unknown>), resource: mcpResource() },
    })
    .abortSignal(AbortSignal.timeout(10000));
  if (error)
    throw new ApiError(
      "Service MCP temporairement indisponible. Réessayez après quelques secondes.",
      503,
      "temporarily_unavailable",
    );
  if (data?.error)
    throw new ApiError(
      (
        {
          unauthorized:
            "Votre connexion MCP a expiré ou a été révoquée. Reconnectez Zyliad dans votre client.",
          forbidden: "Cette action n’est pas autorisée par vos permissions actuelles.",
          conflict:
            "Les données ont changé. Relisez la version actuelle avant de préparer une nouvelle proposition.",
          rate_limited:
            "La limite de requêtes MCP est atteinte. Attendez 60 secondes avant de réessayer.",
          not_found: "Cette ressource est introuvable ou inaccessible dans ce workspace.",
          confirm_in_app:
            "Action sensible : elle ne peut pas être approuvée depuis le client MCP. Donnez à l’utilisateur le lien confirmation_url de la proposition pour qu’il la confirme dans Zyliad.",
          validation_error:
            "Les paramètres ne sont pas valides pour cette opération. Consultez le schéma de l’outil.",
        } as Record<string, string>
      )[data.error] ?? "Cette action MCP n’est pas autorisée.",
      data.error === "unauthorized"
        ? 401
        : data.error === "rate_limited"
          ? 429
          : data.error === "forbidden" || data.error === "confirm_in_app"
            ? 403
            : data.error === "conflict"
              ? 409
              : data.error === "not_found"
                ? 404
                : 400,
      data.error,
    );
  return data;
}
