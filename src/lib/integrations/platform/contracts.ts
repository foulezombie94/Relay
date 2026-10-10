import { z } from "zod";

export const integrationIds = [
  "api-webhooks",
  "google-calendar",
  "gmail",
  "outlook",
  "outlook-calendar",
  "slack",
  "stripe",
  "google-drive",
  "google-sheets",
  "calendly",
  "typeform",
  "notion",
  "zapier",
  "dropbox",
  "onedrive",
  "pandadoc",
  "apollo",
  "google-meet",
  "zoom",
] as const;
export const families = [
  "zyliad",
  "google",
  "microsoft",
  "slack",
  "stripe",
  "calendly",
  "typeform",
  "notion",
  "dropbox",
  "pandadoc",
  "apollo",
  "zoom",
] as const;
export type IntegrationId = (typeof integrationIds)[number];
export type ProviderFamily = (typeof families)[number];
export const statusSchema = z.enum([
  "disconnected",
  "connecting",
  "connected",
  "syncing",
  "degraded",
  "needs_reauth",
  "revoked",
  "error",
]);
export const credentialSchema = z
  .object({
    accessToken: z.string().min(1).max(16384).optional(),
    refreshToken: z.string().min(1).max(16384).optional(),
    apiKey: z.string().min(1).max(16384).optional(),
    botToken: z.string().min(1).max(16384).optional(),
    signingSecret: z.string().min(1).max(16384).optional(),
    expiresAt: z.number().int().positive().optional(),
  })
  .strict();
export type Credentials = z.infer<typeof credentialSchema>;
export const connectionSchema = z
  .object({
    id: z.uuid(),
    workspace_id: z.uuid(),
    connected_by_user_id: z.uuid(),
    provider: z.enum(families),
    external_account_id: z.string().max(500),
    external_account_name: z.string().max(500),
    email: z.string().max(320).nullable(),
    auth_type: z.enum(["oauth2", "api_key", "internal"]),
    granted_scopes: z.array(z.string().max(300)).max(100),
    enabled_integrations: z.array(z.enum(integrationIds)).max(19),
    status: statusSchema,
    last_health_check_at: z.string().nullable(),
    last_sync_at: z.string().nullable(),
    error_code: z.string().max(80).nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
export type SafeConnection = z.infer<typeof connectionSchema>;
export type Actor = {
  workspaceId: string;
  userId: string;
  source: "user" | "automation" | "agent";
  correlationId: string;
  trustedUserRequest?: boolean;
};
export type Risk = 0 | 1 | 2 | 3;
export type Verb = "read" | "create" | "update" | "send" | "delete";
export type AgentPolicy = {
  read: boolean;
  create: boolean;
  update: boolean;
  send: boolean;
  delete: boolean;
  alwaysAskBeforeSending: boolean;
  alwaysAskBeforeDeleting: boolean;
};
export const defaultPolicy: AgentPolicy = {
  read: false,
  create: false,
  update: false,
  send: false,
  delete: false,
  alwaysAskBeforeSending: true,
  alwaysAskBeforeDeleting: true,
};
export type ActionDefinition = {
  name: string;
  integration: IntegrationId;
  description: string;
  input: z.ZodType;
  output: z.ZodType;
  risk: Risk;
  verb: Verb;
  scopes: readonly string[];
  idempotent: boolean;
};
export type ProviderContext = {
  actor: Actor;
  connection: SafeConnection;
  credentials: Credentials;
  generation?: number;
  subscription?: Record<string, unknown>;
  signal?: AbortSignal;
};
export type SyncPage = {
  objects: {
    externalId: string;
    resourceType: string;
    data: Record<string, unknown>;
    deleted?: boolean;
  }[];
  cursor: Record<string, unknown>;
  complete: boolean;
};
export type OAuthRequest = {
  state: string;
  redirectUri: string;
  scopes: string[];
  challenge: string;
};
export type Account = { id: string; name: string; email: string | null };
export type TokenGrant = { credentials: Credentials; scopes: string[] };
export type VerifiedWebhook = {
  eventId: string;
  eventType: string;
  occurredAt: string | null;
  payload: Record<string, unknown>;
};
export interface IntegrationProvider {
  readonly provider: ProviderFamily;
  readonly authType: "oauth2" | "api_key" | "internal";
  readonly supportsPKCE: boolean;
  getCapabilities(): readonly ActionDefinition[];
  connect(request: OAuthRequest): URL;
  exchangeCode(code: string, redirectUri: string, verifier: string): Promise<TokenGrant>;
  identify(credentials: Credentials): Promise<Account>;
  refreshCredentials(credentials: Credentials): Promise<TokenGrant>;
  healthCheck(context: ProviderContext): Promise<Account>;
  executeAction(context: ProviderContext, action: string, input: unknown): Promise<unknown>;
  sync(
    context: ProviderContext,
    resource: string,
    cursor: Record<string, unknown>,
  ): Promise<SyncPage>;
  subscribeWebhooks(context: ProviderContext, callback: URL): Promise<Record<string, unknown>>;
  unsubscribeWebhooks(
    context: ProviderContext,
    subscription: Record<string, unknown>,
  ): Promise<void>;
  handleWebhook(raw: Buffer, headers: Headers, context: ProviderContext): Promise<VerifiedWebhook>;
  revoke(credentials: Credentials): Promise<void>;
  disconnect(context: ProviderContext): Promise<void>;
  normalizeError(error: unknown): { code: string; retryable: boolean; retryAfter?: number };
}

export function needsConfirmation(
  def: Pick<ActionDefinition, "risk" | "verb">,
  source: Actor["source"],
  policy: AgentPolicy,
) {
  if (def.risk === 3) return true;
  if (source === "agent" || source === "automation") {
    return (
      def.risk >= 2 ||
      (def.verb === "send" && policy.alwaysAskBeforeSending) ||
      (def.verb === "delete" && policy.alwaysAskBeforeDeleting)
    );
  }
  return false;
}
export function assertAgentPermission(def: ActionDefinition, actor: Actor, policy: AgentPolicy) {
  if (actor.source !== "user" && !policy[def.verb])
    throw new Error("integration_permission_denied");
}
// Explicit projection: even an unexpectedly enlarged database row cannot expose vault columns.
export function sanitizeConnection(value: Record<string, unknown>): SafeConnection {
  return connectionSchema.parse(
    Object.fromEntries(Object.keys(connectionSchema.shape).map((key) => [key, value[key]])),
  );
}
