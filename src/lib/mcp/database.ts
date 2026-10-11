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
  const { data, error } = await adminDb().rpc("mcp_request", {
    token_hash: tokenHash,
    operation,
    payload: { ...(payload as Record<string, unknown>), resource: mcpResource() },
  });
  if (error) throw new ApiError("Service MCP temporairement indisponible.", 503);
  if (data?.error)
    throw new ApiError(
      "Cette action MCP n’est pas autorisée ou ses données ont changé.",
      data.error === "unauthorized"
        ? 401
        : data.error === "rate_limited"
          ? 429
          : data.error === "forbidden"
            ? 403
            : data.error === "conflict"
              ? 409
              : 400,
      data.error,
    );
  return data;
}
