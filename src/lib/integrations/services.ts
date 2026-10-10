export const services = {
  "google-meet": {
    name: "Google Meet",
    family: "google",
    kind: "meeting",
    scopes: ["openid", "email", "https://www.googleapis.com/auth/meetings.space.readonly"],
    description:
      "Importer vos transcriptions disponibles. Leur création dépend de votre abonnement et des réglages Google Meet.",
  },
  "microsoft-teams": {
    name: "Microsoft Teams",
    family: "microsoft",
    kind: "meeting",
    scopes: [
      "offline_access",
      "User.Read",
      "Calendars.Read",
      "OnlineMeetings.Read",
      "OnlineMeetingTranscript.Read.All",
    ],
    description:
      "Importer les transcriptions de vos réunions organisées dans Teams. Le consentement administrateur peut être nécessaire.",
  },
  zoom: {
    name: "Zoom",
    family: "zoom",
    kind: "meeting",
    scopes: [
      "user:read:user",
      "cloud_recording:read:list_user_recordings",
      "cloud_recording:read:recording",
    ],
    description:
      "Importer vos transcriptions d’enregistrements cloud Zoom déjà disponibles ; aucune capture n’est lancée par Zyliad.",
  },
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
    scopes: ["openid", "email", "https://www.googleapis.com/auth/calendar.events.readonly"],
    description:
      "Lire votre calendrier principal et créer les événements autorisés par vos workflows.",
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
      "Lire votre calendrier Outlook et créer les événements autorisés par vos workflows.",
  },
} as const;
export type Service = keyof typeof services;
export function requestedScopes(p: Service) {
  return [
    ...services[p].scopes,
    ...(p === "google-calendar"
      ? ["https://www.googleapis.com/auth/calendar.events"]
      : p === "outlook-calendar"
        ? ["Calendars.ReadWrite"]
        : []),
  ];
}
export function hasCalendarWriteScope(p: Service, scope: string) {
  const scopes = new Set(scope.toLowerCase().split(/\s+/).filter(Boolean));
  if (p === "google-calendar") return scopes.has("https://www.googleapis.com/auth/calendar.events");
  if (p === "outlook-calendar")
    return (
      scopes.has("calendars.readwrite") ||
      scopes.has("https://graph.microsoft.com/calendars.readwrite")
    );
  return false;
}
export function serviceId(value: string): Service {
  const legacy = value === "google" ? "gmail" : value === "microsoft" ? "outlook" : value;
  if (!Object.hasOwn(services, legacy)) throw new Error("Fournisseur inconnu.");
  return legacy as Service;
}
export function hasRequiredScopes(p: Service, granted: string[]) {
  const normalize = (s: string) => s.toLowerCase().replace("https://graph.microsoft.com/", "");
  const set = new Set(granted.map(normalize));
  if (set.has("calendars.readwrite")) set.add("calendars.read");
  if (set.has("https://www.googleapis.com/auth/calendar.events"))
    set.add("https://www.googleapis.com/auth/calendar.events.readonly");
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
  if (!["https:", "http:"].includes(base.protocol)) throw new Error("Origine invalide.");
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
