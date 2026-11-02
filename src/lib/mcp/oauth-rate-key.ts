import "server-only";
import { ApiError } from "@/lib/api/context";
import { requestSourceKey } from "@/lib/security/request-source";

/** Only trust a platform-overwritten address on the configured Vercel host.
 * Ordinary X-Forwarded-For and user-supplied limiter keys are never accepted.
 */
export function oauthRateKey(request: Request) {
  const key = requestSourceKey(request);
  if (!key)
    throw new ApiError(
      "Service OAuth temporairement indisponible.",
      503,
      "temporarily_unavailable",
    );
  return key;
}
