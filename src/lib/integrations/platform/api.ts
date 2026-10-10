import "server-only";
import { NextResponse } from "next/server";
import { fail, ApiError } from "@/lib/api/context";
import { adminDb } from "@/lib/supabase/admin";
import { IntegrationStore } from "./store";
import { IntegrationRuntime } from "./runtime";
import { platformEnabled, providerFor } from "./registry";
import { IntegrationError } from "./errors";
import { rawBody } from "./webhook-security";
import { ZodError } from "zod";
export async function integrationBody(request: Request): Promise<unknown> {
  try {
    return JSON.parse((await rawBody(request)).toString("utf8"));
  } catch (error) {
    if (error instanceof IntegrationError) throw error;
    throw new IntegrationError("validation_error");
  }
}
export function integrationServices() {
  if (!platformEnabled())
    throw new ApiError("Cette plateforme d’intégrations n’est pas encore activée.", 503);
  const store = new IntegrationStore(adminDb());
  return { store, runtime: new IntegrationRuntime(store, providerFor) };
}
export function integrationFailure(error: unknown) {
  if (error instanceof ZodError) error = new IntegrationError("validation_error", 400);
  if (error instanceof IntegrationError)
    return NextResponse.json(
      { error: error.message, code: error.code },
      {
        status: error.status >= 400 && error.status <= 599 ? error.status : 400,
        headers: {
          "Cache-Control": "no-store",
          ...(error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}),
        },
      },
    );
  return fail(error);
}
