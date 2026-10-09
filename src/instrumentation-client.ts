import * as Sentry from "@sentry/nextjs";
import { scrubEvent, privateDataCollection } from "./lib/observability/privacy";
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  dataCollection: { ...privateDataCollection, httpBodies: [] },
  tracesSampleRate: 0,
  beforeSend: scrubEvent,
});
