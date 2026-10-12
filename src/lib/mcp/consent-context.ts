import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/** Binds the displayed request to its cookie without exposing the raw cookie
 * or the separate flow_hash accepted by the private consent RPC. */
export function consentContext(flow: string) {
  return createHash("sha256")
    .update("zyliad:mcp:displayed-consent:v1\0")
    .update(flow)
    .digest("hex");
}
export function matchesConsentContext(flow: string, displayed: string) {
  if (!/^[a-f0-9]{64}$/.test(displayed)) return false;
  return timingSafeEqual(Buffer.from(consentContext(flow), "hex"), Buffer.from(displayed, "hex"));
}
