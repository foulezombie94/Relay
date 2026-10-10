import "server-only";
import type { IntegrationId, IntegrationProvider, ProviderFamily } from "./contracts";
import { IntegrationError } from "./errors";
import { GoogleProvider, googleScopeSets } from "./providers/google";
import { loadKeyring } from "./vault";
import { appOrigin } from "./oauth-state";
export const familyFor: Record<IntegrationId, ProviderFamily> = {
  "api-webhooks": "zyliad",
  "google-calendar": "google",
  gmail: "google",
  outlook: "microsoft",
  "outlook-calendar": "microsoft",
  slack: "slack",
  stripe: "stripe",
  "google-drive": "google",
  "google-sheets": "google",
  calendly: "calendly",
  typeform: "typeform",
  notion: "notion",
  zapier: "zyliad",
  dropbox: "dropbox",
  onedrive: "microsoft",
  pandadoc: "pandadoc",
  apollo: "apollo",
  "google-meet": "google",
  zoom: "zoom",
};
export function providerFor(family: ProviderFamily): IntegrationProvider {
  if (family === "google") return new GoogleProvider();
  throw new IntegrationError("unsupported", 503);
}
export function scopesFor(integration: IntegrationId, write = false) {
  const set = googleScopeSets[integration];
  if (!set) throw new IntegrationError("unsupported", 503);
  return [
    ...new Set([
      "openid",
      "email",
      ...set.read,
      ...(write || integration === "google-meet" ? set.write : []),
    ]),
  ];
}
export function providerConfigured(family: ProviderFamily) {
  if (family !== "google" || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
    return false;
  try {
    loadKeyring();
    appOrigin();
    return true;
  } catch {
    return false;
  }
}
export function platformEnabled() {
  return process.env.FEATURE_INTEGRATION_PLATFORM === "true";
}
