import "server-only";
import { z } from "zod";
import type {
  Account,
  ActionDefinition,
  Credentials,
  IntegrationProvider,
  OAuthRequest,
  ProviderContext,
  ProviderFamily,
  SyncPage,
  TokenGrant,
  VerifiedWebhook,
} from "./contracts";
import { IntegrationError, normalizeError } from "./errors";
import { providerRequest } from "./http";
export type ProviderAction = ActionDefinition & {
  invoke(context: ProviderContext, input: unknown): Promise<unknown>;
};
export function defineAction<I, O>(
  definition: Omit<ActionDefinition, "input" | "output"> & {
    input: z.ZodType<I>;
    output: z.ZodType<O>;
  },
  invoke: (context: ProviderContext, input: I) => Promise<unknown>,
): ProviderAction {
  return {
    ...definition,
    invoke: (context, input) => invoke(context, definition.input.parse(input)),
  };
}
type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  authorization: string;
  token: string;
  basic?: boolean;
  authorizationParams?: Record<string, string>;
  tokenParams?: Record<string, string>;
};
const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});
export abstract class OAuthProvider implements IntegrationProvider {
  readonly authType = "oauth2" as const;
  abstract readonly provider: ProviderFamily;
  abstract readonly supportsPKCE: boolean;
  protected abstract readonly actions: readonly ProviderAction[];
  protected abstract oauthConfig(): OAuthConfig;
  getCapabilities() {
    return this.actions;
  }
  connect(request: OAuthRequest) {
    const config = this.oauthConfig();
    const url = new URL(config.authorization);
    for (const [key, value] of Object.entries({
      client_id: config.clientId,
      redirect_uri: request.redirectUri,
      response_type: "code",
      state: request.state,
      scope: request.scopes.join(" "),
      ...config.authorizationParams,
    }))
      url.searchParams.set(key, value);
    if (this.supportsPKCE) {
      url.searchParams.set("code_challenge", request.challenge);
      url.searchParams.set("code_challenge_method", "S256");
    }
    return url;
  }
  protected async token(parameters: Record<string, string>): Promise<TokenGrant> {
    const config = this.oauthConfig(),
      url = new URL(config.token);
    const form = new URLSearchParams({ ...config.tokenParams, ...parameters });
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    };
    if (config.basic)
      headers.Authorization =
        "Basic " + Buffer.from(config.clientId + ":" + config.clientSecret).toString("base64");
    else {
      form.set("client_id", config.clientId);
      form.set("client_secret", config.clientSecret);
    }
    const parsed = tokenSchema.safeParse(
      await providerRequest(
        url,
        [url.origin],
        { method: "POST", body: form, headers },
        65536,
        true,
      ),
    );
    if (!parsed.success) throw new IntegrationError("unauthorized", 401);
    const value = parsed.data;
    if (value.token_type && value.token_type.toLowerCase() !== "bearer")
      throw new IntegrationError("unauthorized", 401);
    return {
      credentials: {
        accessToken: value.access_token,
        refreshToken: value.refresh_token,
        expiresAt: value.expires_in ? Date.now() + value.expires_in * 1000 : undefined,
      },
      scopes: value.scope?.split(/[ ,]+/).filter(Boolean) ?? [],
    };
  }
  exchangeCode(code: string, redirectUri: string, verifier: string) {
    return this.token({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      ...(this.supportsPKCE ? { code_verifier: verifier } : {}),
    });
  }
  refreshCredentials(credentials: Credentials) {
    if (!credentials.refreshToken) throw new IntegrationError("token_revoked", 401);
    return this.token({ grant_type: "refresh_token", refresh_token: credentials.refreshToken });
  }
  abstract identify(credentials: Credentials): Promise<Account>;
  async healthCheck(context: ProviderContext) {
    const account = await this.identify(context.credentials);
    if (account.id !== context.connection.external_account_id)
      throw new IntegrationError("unauthorized", 401);
    return account;
  }
  async executeAction(context: ProviderContext, action: string, input: unknown) {
    const definition = this.actions.find((item) => item.name === action);
    if (!definition) throw new IntegrationError("unsupported");
    return definition.output.parse(await definition.invoke(context, input));
  }
  async sync(
    context: ProviderContext,
    resource: string,
    cursor: Record<string, unknown>,
  ): Promise<SyncPage> {
    void context;
    void resource;
    void cursor;
    throw new IntegrationError("unsupported");
  }
  async subscribeWebhooks(
    context: ProviderContext,
    callback: URL,
  ): Promise<Record<string, unknown>> {
    void context;
    void callback;
    throw new IntegrationError("unsupported");
  }
  async unsubscribeWebhooks(
    context: ProviderContext,
    subscription: Record<string, unknown>,
  ): Promise<void> {
    void context;
    void subscription;
    throw new IntegrationError("unsupported");
  }
  async handleWebhook(
    raw: Buffer,
    headers: Headers,
    context: ProviderContext,
  ): Promise<VerifiedWebhook> {
    void raw;
    void headers;
    void context;
    throw new IntegrationError("unsupported");
  }
  abstract revoke(credentials: Credentials): Promise<void>;
  disconnect(context: ProviderContext) {
    return this.revoke(context.credentials);
  }
  normalizeError(error: unknown) {
    return normalizeError(error);
  }
}
export function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new IntegrationError("unsupported", 503);
  return value;
}
export function bearer(credentials: Credentials) {
  const token = credentials.accessToken ?? credentials.botToken;
  if (!token) throw new IntegrationError("unauthorized", 401);
  return "Bearer " + token;
}
