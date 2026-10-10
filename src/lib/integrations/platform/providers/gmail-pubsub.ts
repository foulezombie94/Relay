import "server-only";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { logEvent } from "@/lib/observability/logger";
import type { ProviderContext, VerifiedWebhook } from "../contracts";
import { IntegrationError } from "../errors";
import { requiredEnvironment } from "../provider";

// Reuse Google's certificate cache; never log verification exceptions: they can contain the JWT.
const googleOAuthClient = new OAuth2Client({
  transporterOptions: { timeout: 20_000, retry: false },
});
type Rejection =
  | "missing_authorization"
  | "expired_token"
  | "invalid_audience"
  | "invalid_issuer"
  | "invalid_signature"
  | "wrong_service_account"
  | "email_not_verified"
  | "verification_failed";
function verificationReason(error: unknown): Rejection {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("Token used too late")) return "expired_token";
  if (message.startsWith("Wrong recipient")) return "invalid_audience";
  if (message.startsWith("Invalid issuer")) return "invalid_issuer";
  if (message.startsWith("Invalid token signature")) return "invalid_signature";
  return "verification_failed";
}
async function reject(context: ProviderContext, reason: Rejection): Promise<never> {
  await logEvent("warn", "gmail_pubsub_authentication_rejected", {
    provider: "google",
    code: reason,
    request_id: context.actor.correlationId,
  });
  throw new IntegrationError("unauthorized", 401);
}
const envelopeSchema = z.object({
  subscription: z.string().min(1).max(500),
  message: z.object({
    messageId: z.string().min(1).max(500),
    publishTime: z.iso.datetime({ offset: true }),
    data: z
      .string()
      .min(1)
      .max(8192)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  }),
});
export const gmailNotificationSchema = z
  .object({
    resource: z.literal("gmail:inbox"),
    historyId: z.string().regex(/^\d{1,30}$/),
    emailAddress: z.email().max(320),
  })
  .strict();

export async function verifyGmailNotification(
  raw: Buffer,
  headers: Headers,
  context: ProviderContext,
): Promise<VerifiedWebhook> {
  const audience = z.string().min(1).parse(context.subscription?.audience);
  const expected = requiredEnvironment("GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL");
  const authorization = headers.get("authorization");
  if (
    !authorization ||
    authorization.length > 16_384 ||
    !/^Bearer [A-Za-z0-9._-]+$/.test(authorization)
  )
    return reject(context, "missing_authorization");
  let claims;
  try {
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken: authorization.slice(7),
      audience,
    });
    claims = ticket.getPayload();
  } catch (error) {
    return reject(context, verificationReason(error));
  }
  if (!claims) return reject(context, "verification_failed");
  if (claims.aud !== audience) return reject(context, "invalid_audience");
  if (!["accounts.google.com", "https://accounts.google.com"].includes(claims.iss))
    return reject(context, "invalid_issuer");
  if (claims.exp * 1000 <= Date.now()) return reject(context, "expired_token");
  if (claims.email !== expected) return reject(context, "wrong_service_account");
  if (claims.email_verified !== true) return reject(context, "email_not_verified");
  // Authenticate before decoding or interpreting external data.
  let envelope, message;
  try {
    if (raw.length > 1_048_576) throw new Error();
    envelope = envelopeSchema.parse(JSON.parse(raw.toString("utf8")));
    message = gmailNotificationSchema
      .omit({ resource: true })
      .parse(JSON.parse(Buffer.from(envelope.message.data, "base64").toString("utf8")));
  } catch {
    throw new IntegrationError("validation_error", 400);
  }
  const publishedAt = Date.parse(envelope.message.publishTime);
  if (
    envelope.subscription !== context.subscription?.subscription ||
    message.emailAddress.toLowerCase() !== context.connection.email?.toLowerCase() ||
    publishedAt > Date.now() + 300_000 ||
    publishedAt < Date.now() - 86_400_000
  )
    throw new IntegrationError("unauthorized", 401);
  return {
    eventId: envelope.message.messageId,
    eventType: "gmail.history",
    occurredAt: envelope.message.publishTime,
    payload: {
      resource: "gmail:inbox",
      historyId: message.historyId,
      emailAddress: message.emailAddress,
    },
  };
}
