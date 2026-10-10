import type { ProviderContext } from "./contracts";
export function fixtureContext(): ProviderContext {
  return {
    actor: {
      workspaceId: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000002",
      source: "user",
      correlationId: "00000000-0000-4000-8000-000000000003",
    },
    connection: {
      id: "00000000-0000-4000-8000-000000000004",
      workspace_id: "00000000-0000-4000-8000-000000000001",
      connected_by_user_id: "00000000-0000-4000-8000-000000000002",
      provider: "google",
      external_account_id: "fixture-google-account",
      external_account_name: "Fixture",
      email: "customer@example.com",
      auth_type: "oauth2",
      granted_scopes: [],
      enabled_integrations: [
        "gmail",
        "google-calendar",
        "google-drive",
        "google-sheets",
        "google-meet",
      ],
      status: "connected",
      last_health_check_at: null,
      last_sync_at: null,
      error_code: null,
      created_at: "2026-10-10T00:00:00Z",
      updated_at: "2026-10-10T00:00:00Z",
    },
    credentials: {
      accessToken: "fixture-only-private-access",
      refreshToken: "fixture-only-private-refresh",
      signingSecret: "fixture-only-private-signing",
    },
    generation: 1,
  };
}
