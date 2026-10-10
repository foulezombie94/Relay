import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { credentialSchema, type Credentials, type ProviderFamily } from "./contracts";

export type VaultBinding = {
  workspaceId: string;
  connectionId: string;
  provider: ProviderFamily;
  externalAccountId?: string;
  purpose: "credentials" | "oauth" | "webhook" | "command";
};
const envelopeSchema = z
  .object({
    v: z.literal(1),
    kid: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
    iv: z.string(),
    tag: z.string(),
    data: z.string(),
  })
  .strict();
type Keyring = { active: string; keys: Record<string, Buffer> };
export function loadKeyring(env: Record<string, string | undefined> = process.env): Keyring {
  const raw: unknown = JSON.parse(env.INTEGRATION_VAULT_KEYS ?? "{}");
  const parsed = z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/), z.string()).parse(raw);
  const keys = Object.fromEntries(
    Object.entries(parsed).map(([id, value]) => {
      const bytes = Buffer.from(value, "base64");
      if (bytes.length !== 32 || bytes.toString("base64") !== value)
        throw new Error("integration_vault_key_invalid");
      return [id, bytes];
    }),
  );
  const active = env.INTEGRATION_VAULT_ACTIVE_KEY ?? "";
  if (!keys[active]) throw new Error("integration_vault_not_configured");
  return { active, keys };
}
function aad(binding: VaultBinding) {
  return Buffer.from(
    JSON.stringify([
      "zyliad",
      1,
      binding.workspaceId,
      binding.connectionId,
      binding.provider,
      binding.externalAccountId ?? "",
      binding.purpose,
    ]),
  );
}
export function encrypt(value: unknown, binding: VaultBinding, keyring = loadKeyring()) {
  const plaintext = JSON.stringify(value);
  if (Buffer.byteLength(plaintext) > 1_048_576) throw new Error("integration_vault_payload_limit");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyring.keys[keyring.active], iv);
  cipher.setAAD(aad(binding));
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return JSON.stringify({
    v: 1,
    kid: keyring.active,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    data: data.toString("base64url"),
  });
}
export function decrypt(value: string, binding: VaultBinding, keyring = loadKeyring()): unknown {
  if (Buffer.byteLength(value) > 1_500_000) throw new Error("integration_vault_payload_limit");
  try {
    const envelope = envelopeSchema.parse(JSON.parse(value));
    const key = keyring.keys[envelope.kid];
    const iv = Buffer.from(envelope.iv, "base64url"),
      tag = Buffer.from(envelope.tag, "base64url");
    if (!key || iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aad(binding));
    decipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(envelope.data, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    throw new Error("integration_vault_decryption_failed");
  }
}
export function openCredentials(value: string, binding: VaultBinding): Credentials {
  return credentialSchema.parse(decrypt(value, binding));
}
export function rotateEnvelope(value: string, binding: VaultBinding, keyring = loadKeyring()) {
  return encrypt(decrypt(value, binding, keyring), binding, keyring);
}
