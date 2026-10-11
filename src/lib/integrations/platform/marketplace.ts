import { z } from "zod";
import { connectionSchema, integrationIds, families } from "./contracts";

// Browser-safe metadata only. Unknown database fields are deliberately stripped.
export const marketplaceAvailabilitySchema = z.object({
  id: z.enum(integrationIds),
  provider: z.enum(families),
  implemented: z.boolean(),
  configured: z.boolean(),
  scopes: z.array(z.string()),
  writeScopes: z.array(z.string()),
  missing: z.array(z.string()),
});
export const policyViewSchema = z.object({
  integration: z.enum(integrationIds),
  can_read: z.boolean(),
  can_create: z.boolean(),
  can_update: z.boolean(),
  can_send: z.boolean(),
  can_delete: z.boolean(),
  always_ask_before_sending: z.literal(true),
  always_ask_before_deleting: z.literal(true),
});
export const commandViewSchema = z.object({
  id: z.uuid(),
  connection_id: z.uuid(),
  action: z.string(),
  risk: z.number().int().min(0).max(3),
  status: z.enum([
    "proposed",
    "approved",
    "dispatching",
    "succeeded",
    "failed",
    "unknown",
    "cancelled",
  ]),
  created_at: z.string(),
  expires_at: z.string(),
  error_code: z.string().nullable(),
});
export const auditViewSchema = z.object({
  id: z.union([z.number(), z.string()]),
  connection_id: z.uuid().nullable(),
  source: z.string(),
  provider: z.string(),
  action: z.string(),
  result: z.string(),
  error_code: z.string().nullable(),
  created_at: z.string(),
});
export const marketplaceSnapshotSchema = z.object({
  enabled: z.boolean(),
  apps: z.array(marketplaceAvailabilitySchema),
  connections: z.array(connectionSchema),
  policies: z.array(policyViewSchema),
  commands: z.array(commandViewSchema),
  audit: z.array(auditViewSchema),
});
export type MarketplaceSnapshot = z.infer<typeof marketplaceSnapshotSchema>;
export type MarketplaceAvailability = z.infer<typeof marketplaceAvailabilitySchema>;

export function appConnection(snapshot: MarketplaceSnapshot | undefined, integration: string) {
  return snapshot?.connections.find((connection) =>
    connection.enabled_integrations.some((id) => id === integration),
  );
}
export function connectionInstalled(status?: string) {
  return !!status && ["connected", "syncing", "degraded", "needs_reauth", "error"].includes(status);
}
export function connectionNeedsAttention(status?: string) {
  return !!status && ["degraded", "needs_reauth", "error"].includes(status);
}
