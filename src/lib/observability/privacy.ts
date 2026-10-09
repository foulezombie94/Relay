import type { ErrorEvent } from "@sentry/nextjs";
export const privateDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  frameContextLines: 0,
} as const;
// CRM content, OAuth codes, cookies and provider tokens must never reach telemetry.
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.request;
  delete event.user;
  delete event.extra;
  delete event.breadcrumbs;
  delete event.contexts;
  delete event.logentry;
  if (event.exception?.values)
    for (const exception of event.exception.values) {
      exception.value = "Application error; inspect the correlated job or request.";
    }
  return event;
}
