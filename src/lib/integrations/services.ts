export const services = {
  gmail: {
    name: "Gmail",
    family: "google",
    kind: "email",
    scopes: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    description: "Lire vos messages et envoyer des emails après confirmation.",
  },
  "google-calendar": {
    name: "Google Calendar",
    family: "google",
    kind: "calendar",
    scopes: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/calendar.events.readonly",
    ],
    description:
      "Lire les événements de votre calendrier principal, sans les modifier.",
  },
  outlook: {
    name: "Outlook",
    family: "microsoft",
    kind: "email",
    scopes: ["offline_access", "User.Read", "Mail.Read", "Mail.Send"],
    description: "Lire vos messages et envoyer des emails après confirmation.",
  },
  "outlook-calendar": {
    name: "Outlook Calendar",
    family: "microsoft",
    kind: "calendar",
    scopes: ["offline_access", "User.Read", "Calendars.Read"],
    description:
      "Lire les événements de votre calendrier Outlook, sans les modifier.",
  },
} as const;
export type Service = keyof typeof services;
export function serviceId(value: string): Service {
  const legacy =
    value === "google" ? "gmail" : value === "microsoft" ? "outlook" : value;
  if (!(legacy in services)) throw new Error("Fournisseur inconnu.");
  return legacy as Service;
}
export function hasRequiredScopes(p: Service, granted: string[]) {
  const normalize = (s: string) =>
    s.toLowerCase().replace("https://graph.microsoft.com/", "");
  const set = new Set(granted.map(normalize));
  return services[p].scopes
    .filter((s) => !["openid", "email", "offline_access"].includes(s))
    .every((s) => set.has(normalize(s)));
}
export function callbackOrigin(
  configured: string | undefined,
  origin?: string,
  production = false,
) {
  const base = new URL(configured || origin || "http://localhost:3000");
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/" ||
    (production && base.protocol !== "https:")
  )
    throw new Error("APP_URL doit être une origine HTTPS en production.");
  if (!["https:", "http:"].includes(base.protocol))
    throw new Error("Origine invalide.");
  if (!production && origin) {
    const actual = new URL(origin);
    if (
      ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(actual.hostname) &&
      base.port === actual.port
    )
      return actual.origin;
  }
  return base.origin;
}
