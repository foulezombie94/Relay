import "server-only";
import { IntegrationError, retryAfter } from "./errors";

export async function boundedJSON(response: Response, maxBytes = 1_048_576): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw new IntegrationError("provider_unavailable", 502);
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new IntegrationError("provider_unavailable", 502);
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    if (!bytes.length) return null;
    try {
      return JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new IntegrationError("provider_unavailable", 502);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
export async function providerRequest(
  url: URL,
  allowedOrigins: readonly string[],
  init: RequestInit = {},
  maxBytes = 1_048_576,
  oauth = false,
): Promise<unknown> {
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    !allowedOrigins.includes(url.origin)
  )
    throw new IntegrationError("validation_error");
  if (init.body && Buffer.byteLength(String(init.body)) > 1_048_576)
    throw new IntegrationError("validation_error");
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: "error",
      cache: "no-store",
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(20_000)])
        : AbortSignal.timeout(20_000),
    });
  } catch {
    throw new IntegrationError("provider_unavailable", 503);
  }
  if (!response.ok) {
    if (oauth && response.status === 400) {
      const error = await boundedJSON(response, 65536);
      if (error && typeof error === "object" && "error" in error && error.error === "invalid_grant")
        throw new IntegrationError("token_revoked", 401);
      throw new IntegrationError("unauthorized", 401);
    }
    await response.body?.cancel();
    const status = response.status;
    throw new IntegrationError(
      status === 401
        ? "unauthorized"
        : status === 403
          ? "forbidden"
          : status === 404
            ? "not_found"
            : [409, 412].includes(status)
              ? "conflict"
              : status === 429
                ? "rate_limited"
                : status >= 500 || status === 408
                  ? "provider_unavailable"
                  : "validation_error",
      status,
      retryAfter(response.headers.get("retry-after")),
    );
  }
  return boundedJSON(response, maxBytes);
}
export function resourceId(value: string) {
  if (!value || value === "." || value === ".." || value.length > 500 || /[\x00-\x1f]/.test(value))
    throw new IntegrationError("validation_error");
  return encodeURIComponent(value);
}
