import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomBytes } from "node:crypto";
import { integrationIds } from "./contracts";
import { fixtureContext } from "./test-support";
import { marketplaceAvailability } from "./availability";
import {
  appConnection,
  connectionInstalled,
  connectionNeedsAttention,
  marketplaceSnapshotSchema,
} from "./marketplace";
import { appCatalog } from "@/components/integrations/app-catalog";

afterEach(() => vi.unstubAllEnvs());
describe("marketplace readiness and credential boundary", () => {
  it("includes all 19 apps exactly once and preserves the Teams connector", () => {
    expect(new Set(appCatalog.map((app) => app.id)).size).toBe(appCatalog.length);
    for (const id of integrationIds) {
      const app = appCatalog.find((row) => row.id === id)!;
      expect(app).toBeDefined();
      expect(app.features.length).toBeGreaterThan(0);
      for (const url of [app.website, app.documentation, app.support])
        expect(url.startsWith("https://") || url.startsWith("/doc")).toBe(true);
    }
    expect(appCatalog.find((app) => app.id === "microsoft-teams")).toBeDefined();
  });
  it("does not activate unsupported providers merely because secrets exist", () => {
    vi.stubEnv("FEATURE_INTEGRATION_PLATFORM", "true");
    vi.stubEnv("SLACK_CLIENT_SECRET", "fixture-private-value");
    const apps = marketplaceAvailability();
    expect(apps).toHaveLength(19);
    expect(
      apps
        .filter((app) => app.implemented)
        .map((app) => app.id)
        .sort(),
    ).toEqual(["gmail", "google-calendar", "google-drive", "google-meet", "google-sheets"]);
    expect(
      apps
        .filter((app) => !app.implemented)
        .every((app) => !app.configured && app.scopes.length === 0),
    ).toBe(true);
    expect(JSON.stringify(apps)).not.toContain("fixture-private-value");
  });
  it("requires a valid vault, fixed origin and rollout flag, with incremental scopes", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "fixture-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture-only-private-secret");
    vi.stubEnv(
      "INTEGRATION_VAULT_KEYS",
      JSON.stringify({ fixture: randomBytes(32).toString("base64") }),
    );
    vi.stubEnv("INTEGRATION_VAULT_ACTIVE_KEY", "fixture");
    vi.stubEnv("APP_URL", "https://zyliad.example");
    vi.stubEnv("FEATURE_INTEGRATION_PLATFORM", "false");
    expect(marketplaceAvailability().some((app) => app.configured)).toBe(false);
    vi.stubEnv("FEATURE_INTEGRATION_PLATFORM", "true");
    const apps = marketplaceAvailability();
    expect(apps.filter((app) => app.configured)).toHaveLength(5);
    expect(apps.find((app) => app.id === "google-calendar")?.scopes.join(" ")).not.toMatch(
      /gmail|drive/,
    );
    expect(JSON.stringify(apps)).not.toContain("fixture-only-private-secret");
    vi.stubEnv("INTEGRATION_VAULT_KEYS", "{}");
    expect(marketplaceAvailability().some((app) => app.configured)).toBe(false);
  });
  it("strips unexpected fields from browser metadata and matches enabled apps only", () => {
    const connection = fixtureContext().connection;
    const snapshot = marketplaceSnapshotSchema.parse({
      enabled: true,
      apps: [],
      connections: [connection],
      policies: [],
      commands: [
        {
          id: connection.id,
          connection_id: connection.id,
          action: "gmail.send",
          risk: 2,
          status: "proposed",
          created_at: connection.created_at,
          expires_at: connection.created_at,
          error_code: null,
          encrypted_input: "private-command",
        },
      ],
      audit: [
        {
          id: 1,
          connection_id: connection.id,
          source: "user",
          provider: "google",
          action: "integration.connected",
          result: "success",
          created_at: connection.created_at,
          error_code: null,
          encrypted_credentials: "private-vault",
        },
      ],
      access_token: "private-token",
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/private-command|private-vault|private-token/);
    expect(appConnection(snapshot, "gmail")?.id).toBe(connection.id);
    expect(appConnection(snapshot, "slack")).toBeUndefined();
    expect(connectionInstalled("needs_reauth")).toBe(true);
    expect(connectionNeedsAttention("needs_reauth")).toBe(true);
    expect(connectionInstalled("revoked")).toBe(false);
    expect(connectionInstalled("connecting")).toBe(false);
  });
});
