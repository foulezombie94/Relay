import "server-only";
import { marketplaceApps } from "./catalog";
import { platformEnabled, providerConfigured, scopesFor } from "./registry";
import type { MarketplaceAvailability } from "./marketplace";

export function marketplaceAvailability(): MarketplaceAvailability[] {
  return marketplaceApps.map((app) => {
    const implemented = app.provider === "google";
    const enabled = platformEnabled();
    const missing = implemented
      ? [
          !enabled ? "FEATURE_INTEGRATION_PLATFORM" : "",
          !process.env.GOOGLE_CLIENT_ID ? "GOOGLE_CLIENT_ID" : "",
          !process.env.GOOGLE_CLIENT_SECRET ? "GOOGLE_CLIENT_SECRET" : "",
          !process.env.INTEGRATION_VAULT_KEYS ? "INTEGRATION_VAULT_KEYS" : "",
          !process.env.INTEGRATION_VAULT_ACTIVE_KEY ? "INTEGRATION_VAULT_ACTIVE_KEY" : "",
          !process.env.APP_URL ? "APP_URL" : "",
        ].filter(Boolean)
      : [];
    const valid = implemented && providerConfigured(app.provider);
    if (implemented && !valid && !missing.length)
      missing.push("Configuration OAuth/vault à vérifier");
    return {
      id: app.id,
      provider: app.provider,
      implemented,
      configured: enabled && valid,
      scopes: implemented ? scopesFor(app.id) : [],
      writeScopes: implemented ? scopesFor(app.id, true) : [],
      missing,
    };
  });
}
