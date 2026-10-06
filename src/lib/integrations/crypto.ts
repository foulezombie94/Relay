import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function key() {
  const bytes = Buffer.from(
    process.env.INTEGRATION_ENCRYPTION_KEY || "",
    "base64",
  );
  if (bytes.length !== 32)
    throw new Error(
      "Clé de chiffrement des intégrations manquante ou invalide.",
    );
  return bytes;
}
export function seal(data: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}
export function unseal<T>(value: string): T {
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length < 29) throw new Error("Données chiffrées invalides.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    bytes.subarray(0, 12),
  );
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString("utf8"),
  );
}
export function state() {
  const verifier = randomBytes(32).toString("base64url");
  return {
    state: randomBytes(32).toString("base64url"),
    verifier,
    challenge: digestChallenge(verifier),
  };
}
function digestChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}
