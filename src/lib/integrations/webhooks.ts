import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seal, unseal } from "./crypto";
import { resolveWorkflowDestination, workflowPost, workflowURL } from "./workflow-http";
import { signatureHeader } from "@/lib/domain/public-api";

export function generateWebhookSecret() {
  return "whsec_" + randomBytes(32).toString("base64url");
}
export function sealWebhookSecret(secret: string) {
  return seal({ secret });
}
/** Throws when the destination is not a public HTTPS URL (checked again, with DNS, at delivery). */
export function assertWebhookUrl(url: string) {
  workflowURL(url);
}
/** `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`, as documented in the OpenAPI spec. */
export function webhookSignature(secret: string, body: string, timestamp: number) {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}
/** Receiver-side verification helper (also used by tests): constant time, 5-minute tolerance. */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string,
  now = Math.floor(Date.now() / 1000),
) {
  const parts = Object.fromEntries(header.split(",").map((part) => part.split("=", 2)));
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > 300 || !parts.v1) return false;
  const expected = webhookSignature(secret, body, timestamp).split("v1=")[1];
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(String(parts.v1), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

type Claimed = {
  id: string;
  event_id: string;
  event_type: string;
  payload: unknown;
  attempts: number;
  url: string;
  sealed: string;
};
/** Claims due deliveries, signs and POSTs them, then records each outcome under its lease. */
export async function deliverWebhooks(admin: SupabaseClient, worker: string, batch = 20) {
  const { data, error } = await admin.rpc("webhook_claim", { worker, batch });
  if (error) throw Object.assign(new Error("webhook_claim"), { code: error.code });
  const deliveries = (Array.isArray(data) ? data : []) as Claimed[];
  let delivered = 0;
  let failed = 0;
  await Promise.all(
    deliveries.map(async (delivery) => {
      let succeeded = false;
      let status: number | null = null;
      let failure: string | null = null;
      try {
        const { secret } = unseal<{ secret: string }>(delivery.sealed);
        const body = JSON.stringify(delivery.payload);
        const resolved = await resolveWorkflowDestination(delivery.url);
        const timestamp = Math.floor(Date.now() / 1000);
        const response = await workflowPost(
          delivery.url,
          delivery.payload,
          {
            "User-Agent": "Zyliad-Webhooks/1.0",
            [signatureHeader]: webhookSignature(secret, body, timestamp),
            "Zyliad-Event-Id": delivery.event_id,
            "Zyliad-Event-Type": delivery.event_type,
            "Zyliad-Delivery-Attempt": String(delivery.attempts),
          },
          resolved,
        );
        status = response.status;
        succeeded = response.status >= 200 && response.status < 300;
        if (!succeeded) failure = `HTTP ${response.status}`;
      } catch (e) {
        // Only our own short messages are stored, never the remote response body.
        failure = e instanceof Error ? e.message.slice(0, 200) : "Échec de livraison";
      }
      const { error: completeError } = await admin.rpc("webhook_complete", {
        delivery: delivery.id,
        worker,
        succeeded,
        http_status: status,
        error_text: failure,
      });
      if (completeError)
        throw Object.assign(new Error("webhook_complete"), { code: completeError.code });
      if (succeeded) delivered++;
      else failed++;
    }),
  );
  return { delivered, failed };
}
