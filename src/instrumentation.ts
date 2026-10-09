export async function register() {
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
