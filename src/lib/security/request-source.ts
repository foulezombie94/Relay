import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";

/** Keyed digest of the caller's network address, for per-source rate limits.
 * Only the platform-overwritten Vercel address is trusted: ordinary
 * X-Forwarded-For headers are client-controlled and never used. Returns null
 * when no trustworthy address is available, so callers can fail closed.
 */
export function requestSourceKey(request: Request) {
  const production = process.env.NODE_ENV === "production";
  const address =
    process.env.VERCEL === "1"
      ? request.headers.get("x-vercel-forwarded-for")?.trim()
      : production
        ? undefined
        : "127.0.0.1";
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!address || !isIP(address) || (production && !key)) return null;
  return createHmac("sha256", key || "local-test-rate-key")
    .update(address)
    .digest("hex");
}
