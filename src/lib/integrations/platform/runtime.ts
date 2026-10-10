import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  assertAgentPermission,
  defaultPolicy,
  needsConfirmation,
  sanitizeConnection,
  type Actor,
  type AgentPolicy,
  type IntegrationProvider,
  type ProviderContext,
  type ProviderFamily,
} from "./contracts";
import { decrypt, encrypt, openCredentials, type VaultBinding } from "./vault";
import { IntegrationError, normalizeError } from "./errors";
import { IntegrationStore } from "./store";
import { hasScopes } from "./scopes";

const loadedSchema = z.object({
  connection: z.record(z.string(), z.unknown()),
  encrypted_credentials: z.string(),
  revision: z.number().int(),
  generation: z.number().int(),
});
const commandSchema = z.object({
  id: z.uuid(),
  status: z.string(),
  encrypted_result: z.string().nullable(),
});
export function hashInput(value: unknown): string {
  const canonical = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(canonical)
      : item && typeof item === "object"
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, value]) => [key, canonical(value)]),
          )
        : item;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
export const bindingFor = (
  context: Pick<ProviderContext, "actor" | "connection">,
  purpose: VaultBinding["purpose"],
): VaultBinding => ({
  workspaceId: context.actor.workspaceId,
  connectionId: context.connection.id,
  provider: context.connection.provider,
  externalAccountId: context.connection.external_account_id,
  purpose,
});
export class IntegrationRuntime {
  constructor(
    readonly store: IntegrationStore,
    private readonly resolve: (family: ProviderFamily) => IntegrationProvider,
  ) {}
  async load(actor: Actor, connectionId: string): Promise<ProviderContext> {
    const loaded = loadedSchema.parse(
      await this.store.call(actor, "load", { connection_id: connectionId }),
    );
    const connection = sanitizeConnection(loaded.connection);
    const context = {
      actor,
      connection,
      generation: loaded.generation,
      credentials: openCredentials(loaded.encrypted_credentials, {
        workspaceId: actor.workspaceId,
        connectionId,
        provider: connection.provider,
        externalAccountId: connection.external_account_id,
        purpose: "credentials",
      }),
    };
    if (context.credentials.expiresAt && context.credentials.expiresAt <= Date.now() + 60_000) {
      const lease = z
        .uuid()
        .nullable()
        .parse(
          await this.store.call(actor, "refresh_claim", {
            connection_id: connectionId,
            revision: loaded.revision,
          }),
        );
      if (!lease) throw new IntegrationError("provider_unavailable", 503, 2);
      try {
        const grant = await this.resolve(connection.provider).refreshCredentials(
          context.credentials,
        );
        // Providers may rotate refresh tokens or omit the existing one.
        context.credentials = {
          ...grant.credentials,
          refreshToken: grant.credentials.refreshToken ?? context.credentials.refreshToken,
        };
        await this.store.call(actor, "refresh_finish", {
          connection_id: connectionId,
          revision: loaded.revision,
          lease,
          encrypted_credentials: encrypt(context.credentials, bindingFor(context, "credentials")),
          scopes: grant.scopes.length ? grant.scopes : connection.granted_scopes,
          expires_at: context.credentials.expiresAt
            ? new Date(context.credentials.expiresAt).toISOString()
            : null,
        });
        if (grant.scopes.length) context.connection.granted_scopes = grant.scopes;
      } catch (error) {
        if (
          error instanceof IntegrationError &&
          ["unauthorized", "token_revoked"].includes(error.code)
        )
          await this.store.call(actor, "status", {
            connection_id: connectionId,
            generation: context.generation,
            status: "needs_reauth",
            error_code: "token_revoked",
          });
        throw error;
      } finally {
        await this.store
          .call(actor, "refresh_release", { connection_id: connectionId, lease })
          .catch(() => undefined);
      }
    }
    return context;
  }
  async policy(actor: Actor, context: ProviderContext, integration: string): Promise<AgentPolicy> {
    const value = z.record(z.string(), z.unknown()).parse(
      await this.store.call(actor, "policy", {
        connection_id: context.connection.id,
        integration,
      }),
    );
    return {
      read: value.can_read === true,
      create: value.can_create === true,
      update: value.can_update === true,
      send: value.can_send === true,
      delete: value.can_delete === true,
      alwaysAskBeforeSending: value.always_ask_before_sending !== false,
      alwaysAskBeforeDeleting: value.always_ask_before_deleting !== false,
    };
  }
  async execute(
    actor: Actor,
    connectionId: string,
    action: string,
    rawInput: unknown,
    approvedCommandId?: string,
  ) {
    const context = await this.load(actor, connectionId),
      provider = this.resolve(context.connection.provider);
    const definition = provider.getCapabilities().find((capability) => capability.name === action);
    if (!definition || !context.connection.enabled_integrations.includes(definition.integration))
      throw new IntegrationError("unsupported");
    const parsed = definition.input.safeParse(rawInput);
    if (!parsed.success) throw new IntegrationError("validation_error");
    const input: unknown = parsed.data;
    if (
      !hasScopes(context.connection.provider, context.connection.granted_scopes, definition.scopes)
    )
      throw new IntegrationError("insufficient_scope", 403);
    const policy =
      actor.source === "user"
        ? defaultPolicy
        : await this.policy(actor, context, definition.integration);
    try {
      assertAgentPermission(definition, actor, policy);
    } catch {
      throw new IntegrationError("forbidden", 403);
    }
    const requestHash = hashInput({ action, input, source: actor.source, connectionId });
    const command = commandSchema.parse(
      await this.store.call(actor, "command_create", {
        connection_id: connectionId,
        generation: context.generation,
        source: actor.source,
        action,
        integration: definition.integration,
        verb: definition.verb,
        request_hash: requestHash,
        encrypted_input: encrypt(
          { action, input, source: actor.source },
          bindingFor(context, "command"),
        ),
        risk: definition.risk,
        confirmation:
          needsConfirmation(definition, actor.source, policy) ||
          (actor.source !== "user" &&
            definition.verb !== "read" &&
            actor.trustedUserRequest !== true),
        correlation_id: actor.correlationId,
      }),
    );
    if (approvedCommandId && command.id !== approvedCommandId)
      throw new IntegrationError("conflict", 409);
    if (command.status === "succeeded" && command.encrypted_result) {
      const data = definition.output.parse(
        decrypt(command.encrypted_result, bindingFor(context, "command")),
      );
      assertNoCredentialLeak(data, context.credentials);
      return { status: "succeeded" as const, commandId: command.id, data };
    }
    if (command.status === "proposed") {
      await this.audit(context, action, "proposed");
      return {
        status: "confirmation_required" as const,
        commandId: command.id,
        action,
        risk: definition.risk,
        input,
      };
    }
    if (command.status !== "approved") throw new IntegrationError("conflict", 409);
    const admission = z
      .object({ allowed: z.boolean(), retry_after: z.number().optional() })
      .parse(await this.store.call(actor, "admit", { connection_id: connectionId }));
    if (!admission.allowed) throw new IntegrationError("rate_limited", 429, admission.retry_after);
    const { lease } = z.object({ lease: z.uuid() }).parse(
      await this.store.call(actor, "command_claim", {
        connection_id: connectionId,
        generation: context.generation,
        command_id: command.id,
        request_hash: requestHash,
      }),
    );
    const started = Date.now();
    let data: unknown;
    try {
      data = definition.output.parse(await provider.executeAction(context, action, input));
      assertNoCredentialLeak(data, context.credentials);
    } catch (error) {
      const normalized = normalizeError(error);
      // A timed-out non-idempotent mutation may already have reached the provider.
      // Retrying requires human reconciliation; it is never replayed by the queue.
      const uncertain =
        !definition.idempotent &&
        definition.verb !== "read" &&
        (normalized.retryable || normalized.code === "unknown");
      await this.store.call(actor, "command_finish", {
        connection_id: connectionId,
        command_id: command.id,
        lease,
        status: uncertain ? "unknown" : "failed",
        error_code: normalized.code,
      });
      await this.audit(
        context,
        action,
        uncertain ? "unknown" : "failure",
        Date.now() - started,
        normalized.code,
      );
      if (normalized.code === "rate_limited")
        await this.store.call(actor, "rate_block", {
          connection_id: connectionId,
          seconds: normalized.retryAfter ?? 60,
        });
      if (["unauthorized", "token_revoked"].includes(normalized.code))
        await this.store.call(actor, "status", {
          connection_id: connectionId,
          generation: context.generation,
          status: "needs_reauth",
          error_code: normalized.code,
        });
      throw error instanceof IntegrationError ? error : new IntegrationError("unknown", 502);
    }
    await this.store.call(actor, "command_finish", {
      connection_id: connectionId,
      command_id: command.id,
      lease,
      status: "succeeded",
      encrypted_result: encrypt(data, bindingFor(context, "command")),
    });
    await this.audit(context, action, "success", Date.now() - started);
    return { status: "succeeded" as const, commandId: command.id, data };
  }
  async executeApproved(actor: Actor, connectionId: string, commandId: string) {
    const context = await this.load(actor, connectionId);
    const row = z
      .object({
        encrypted_input: z.string(),
        correlation_id: z.uuid(),
        source: z.enum(["user", "agent", "automation"]),
      })
      .parse(
        await this.store.call(actor, "command_load", {
          connection_id: connectionId,
          command_id: commandId,
        }),
      );
    const proposal = z
      .object({
        action: z.string(),
        input: z.unknown(),
        source: z.enum(["user", "agent", "automation"]),
      })
      .parse(decrypt(row.encrypted_input, bindingFor(context, "command")));
    if (proposal.source !== row.source) throw new IntegrationError("forbidden", 403);
    return this.execute(
      { ...actor, source: row.source, correlationId: row.correlation_id },
      connectionId,
      proposal.action,
      proposal.input,
      commandId,
    );
  }
  async audit(
    context: ProviderContext,
    action: string,
    result: "success" | "failure" | "unknown" | "proposed",
    latency?: number,
    errorCode?: string,
  ) {
    await this.store.call(context.actor, "audit", {
      connection_id: context.connection.id,
      source: context.actor.source,
      action,
      result,
      latency_ms: latency,
      error_code: errorCode,
      correlation_id: context.actor.correlationId,
    });
  }
}
export function userActor(workspaceId: string, userId: string): Actor {
  return { workspaceId, userId, source: "user", correlationId: randomUUID() };
}
export function assertNoCredentialLeak(data: unknown, credentials: ProviderContext["credentials"]) {
  const secrets = Object.values(credentials).filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const walk = (value: unknown): void => {
    if (typeof value === "string" && secrets.some((secret) => value.includes(secret)))
      throw new IntegrationError("unknown", 502);
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object")
      Object.entries(value).forEach(([key, item]) => {
        walk(key);
        walk(item);
      });
  };
  walk(data);
}
