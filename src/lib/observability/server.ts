import * as Sentry from "@sentry/node";
import { scrubEvent, privateDataCollection } from "./privacy";
export function initWorkerMonitoring() {
  Sentry.init({ dsn: process.env.SENTRY_DSN, enabled: !!process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development", dataCollection: {...privateDataCollection,httpBodies:[]},
    defaultIntegrations: false, beforeSend: scrubEvent });
}
export function reportError(code: string, tags: Record<string, string> = {}) {
  Sentry.captureException(new Error(code), { tags });
}
export async function flushMonitoring() { await Sentry.flush(2000); }
