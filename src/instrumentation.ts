import { getSupabaseConfig } from "./lib/supabase/config";
export async function register() {
  const config = getSupabaseConfig();
  let appUrl: URL;
  try {
    appUrl = new URL(process.env.APP_URL ?? "");
  } catch {
    throw new Error("APP_URL is missing or invalid.");
  }
  if (config.environment === "production" && appUrl.protocol !== "https:")
    throw new Error("Production APP_URL must use HTTPS.");
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    const { scrubEvent, privateDataCollection } = await import("./lib/observability/privacy");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      enabled: !!process.env.SENTRY_DSN,
      dataCollection: { ...privateDataCollection, httpBodies: [] },
      environment: process.env.NODE_ENV,
      beforeSend: scrubEvent,
      tracesSampleRate: 0,
    });
  }
}
export const onRequestError: import("next").Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(error, request, context);
  await Sentry.flush(2000);
};
