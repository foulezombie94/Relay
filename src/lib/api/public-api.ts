import "server-only";
import { createHash, randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { adminDb } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logger";

/** Machine-readable error, rendered as `{ "error": { "code", "message" } }`. */
export class PublicApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public headers: Record<string, string> = {},
  ) {
    super(message);
  }
}
const baseHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** A new secret API key and the parts stored server side (digest + display prefix). */
export function generateApiKey() {
  let body = "";
  for (let i = 0; i < 48; i++) body += alphabet[randomInt(alphabet.length)];
  const key = "zk_" + body;
  return { key, prefix: key.slice(0, 11), hash: keyDigest(key) };
}
export const keyDigest = (key: string) => createHash("sha256").update(key).digest("hex");

export function bearerKey(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (zk_[A-Za-z0-9]{48})$/.exec(header.trim());
  if (!match)
    throw new PublicApiError(
      401,
      "invalid_key",
      "Fournissez une clé API valide : Authorization: Bearer zk_…",
      { "WWW-Authenticate": 'Bearer realm="zyliad"' },
    );
  return match[1];
}

export async function boundedJson(request: NextRequest, limit = 65536): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new PublicApiError(
      415,
      "unsupported_media_type",
      "Content-Type application/json requis.",
    );
  if (Number(request.headers.get("content-length") || 0) > limit)
    throw new PublicApiError(413, "payload_too_large", "Corps de requête trop volumineux.");
  const reader = request.body?.getReader();
  if (!reader) throw new PublicApiError(400, "validation_error", "Corps JSON manquant.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new PublicApiError(413, "payload_too_large", "Corps de requête trop volumineux.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new PublicApiError(400, "validation_error", "JSON invalide.");
  }
}

const idempotencyKey = z
  .string()
  .min(8)
  .max(100)
  .regex(/^[A-Za-z0-9._:-]+$/);
/** Writes require an Idempotency-Key; the digest binds it to the exact request. */
export function writeIdentity(request: NextRequest, operation: string, payload: unknown) {
  const parsed = idempotencyKey.safeParse(request.headers.get("idempotency-key"));
  if (!parsed.success)
    throw new PublicApiError(
      400,
      "idempotency_key_required",
      "En-tête Idempotency-Key requis (8 à 100 caractères : lettres, chiffres, . _ : -).",
    );
  const digest = createHash("sha256")
    .update(operation + "\0" + JSON.stringify(payload ?? null))
    .digest("hex");
  return { requestId: parsed.data, digest };
}

const errorStatus: Record<string, number> = {
  invalid_key: 401,
  insufficient_scope: 403,
  forbidden: 403,
  not_found: 404,
  version_conflict: 409,
  conflict: 409,
  idempotency_conflict: 409,
  idempotency_key_required: 400,
  validation_error: 422,
  rate_limited: 429,
  unsupported_operation: 404,
};
const errorMessages: Record<string, string> = {
  invalid_key: "Clé API invalide, expirée ou révoquée.",
  insufficient_scope: "Cette clé n’a pas la permission requise.",
  forbidden: "Le créateur de cette clé n’a pas accès à cette ressource.",
  not_found: "Ressource introuvable.",
  version_conflict: "La ressource a changé depuis sa lecture. Relisez-la avant de réessayer.",
  conflict: "Conflit d’écriture concurrent. Réessayez.",
  idempotency_conflict: "Cette Idempotency-Key a déjà servi pour une requête différente.",
  rate_limited: "Limite de 120 requêtes par minute atteinte.",
  unsupported_operation: "Opération inconnue.",
};

/** Runs one operation through public.api_request and maps its result to HTTP. */
export async function apiCall(
  request: NextRequest,
  operation: string,
  payload: Record<string, unknown> = {},
  write?: { requestId: string; digest: string },
) {
  const key = bearerKey(request);
  const { data, error } = await adminDb().rpc("api_request", {
    key_hash: keyDigest(key),
    operation,
    payload,
    request_id: write?.requestId ?? null,
    request_digest: write?.digest ?? null,
  });
  if (error) throw Object.assign(new Error("public_api_rpc"), { code: error.code });
  const result = (data ?? {}) as Record<string, unknown>;
  if (typeof result.error === "string") {
    const code = result.error;
    throw new PublicApiError(
      errorStatus[code] ?? 400,
      code,
      typeof result.message === "string"
        ? result.message
        : code === "insufficient_scope" && typeof result.scope === "string"
          ? `Permission requise : ${result.scope}.`
          : (errorMessages[code] ?? "Requête invalide."),
      code === "rate_limited" ? { "Retry-After": String(Number(result.retry_after) || 60) } : {},
    );
  }
  return result;
}

export function apiJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...baseHeaders, ...headers } });
}

export function apiFailure(error: unknown) {
  if (error instanceof PublicApiError)
    return apiJson(
      { error: { code: error.code, message: error.message } },
      error.status,
      error.headers,
    );
  if (error instanceof z.ZodError)
    return apiJson(
      {
        error: {
          code: "validation_error",
          message: error.issues
            .map((i) => (i.path.length ? i.path.join(".") + " : " : "") + i.message)
            .join(" ; "),
        },
      },
      422,
    );
  const requestId = crypto.randomUUID();
  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code.slice(0, 40)
      : undefined;
  Sentry.captureException(new Error("public_api_failure"), {
    tags: { request_id: requestId, ...(code ? { code } : {}) },
  });
  void logEvent("error", "public_api_failure", { request_id: requestId, code });
  return apiJson(
    {
      error: {
        code: "internal_error",
        message: "Erreur interne. Réessayez.",
        request_id: requestId,
      },
    },
    500,
    { "X-Request-ID": requestId },
  );
}

/** Opaque pagination cursor over (timestamp, id). */
export function encodeCursor(cursor: unknown) {
  const parsed = z.object({ at: z.string(), id: z.uuid() }).safeParse(cursor);
  return parsed.success
    ? Buffer.from(parsed.data.at + "|" + parsed.data.id).toString("base64url")
    : null;
}
export function decodeCursor(value: string | null) {
  if (!value) return {};
  try {
    const [at, id] = Buffer.from(value, "base64url").toString("utf8").split("|");
    return { cursor_at: z.iso.datetime({ offset: true }).parse(at), cursor_id: z.uuid().parse(id) };
  } catch {
    throw new PublicApiError(400, "validation_error", "Curseur de pagination invalide.");
  }
}
export function page(result: Record<string, unknown>) {
  return {
    data: result.data ?? [],
    has_more: result.has_more === true,
    next_cursor: encodeCursor(result.next_cursor),
  };
}
