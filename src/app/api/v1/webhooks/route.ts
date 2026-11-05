import { NextRequest } from "next/server";
import {
  apiCall,
  apiFailure,
  apiJson,
  boundedJson,
  PublicApiError,
  writeIdentity,
} from "@/lib/api/public-api";
import { createWebhookBody } from "@/lib/domain/public-api";
import {
  assertWebhookUrl,
  generateWebhookSecret,
  sealWebhookSecret,
} from "@/lib/integrations/webhooks";

export async function GET(request: NextRequest) {
  try {
    return apiJson(await apiCall(request, "webhooks.list"));
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = createWebhookBody.parse(await boundedJson(request));
    try {
      assertWebhookUrl(body.url);
    } catch {
      throw new PublicApiError(422, "validation_error", "Utilisez une URL HTTPS publique.");
    }
    // The digest covers the caller's body only: the sealed secret differs on every attempt.
    const identity = writeIdentity(request, "webhooks.create", body);
    const secret = generateWebhookSecret();
    const result = await apiCall(
      request,
      "webhooks.create",
      { ...body, sealed_secret: sealWebhookSecret(secret) },
      identity,
    );
    const data = result.data as Record<string, unknown>;
    return apiJson(
      // A replay cannot reveal the original secret again: rotate it from the application.
      { data: { ...data, secret: result.replayed ? null : secret } },
      result.replayed ? 200 : 201,
    );
  } catch (error) {
    return apiFailure(error);
  }
}
