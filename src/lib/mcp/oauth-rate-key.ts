import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { ApiError } from "@/lib/api/context";

/** Only trust a platform-overwritten address on the configured Vercel host.
 * Ordinary X-Forwarded-For and user-supplied limiter keys are never accepted.
 */
export function oauthRateKey(request: Request) {
  const production = process.env.NODE_ENV === "production";
  const address =
    process.env.VERCEL === "1"
      ? request.headers.get("x-vercel-forwarded-for")?.trim()
      : production
        ? undefined
        : "127.0.0.1";
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!address || !isIP(address) || (production && !key))
    throw new ApiError(
      "Service OAuth temporairement indisponible.",
      503,
      "temporarily_unavailable",
    );
  return createHmac("sha256", key || "local-test-rate-key")
    .update(address)
    .digest("hex");
}
