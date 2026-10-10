import "server-only";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { IntegrationError } from "./errors";
export function secureEqual(left: string, right: string) {
  const a = Buffer.from(left),
    b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function verifyHmac({
  raw,
  secret,
  signature,
  signed,
  encoding = "hex",
  timestamp,
  tolerance = 300,
  now = Date.now(),
}: {
  raw: Buffer;
  secret: string;
  signature: string | null;
  signed?: Buffer;
  encoding?: "hex" | "base64";
  timestamp?: number;
  tolerance?: number;
  now?: number;
}) {
  if (
    !signature ||
    !secret ||
    raw.byteLength > 1_048_576 ||
    (timestamp !== undefined &&
      (!Number.isFinite(timestamp) || Math.abs(now / 1000 - timestamp) > tolerance))
  )
    throw new IntegrationError("unauthorized", 401);
  const expected = createHmac("sha256", secret)
    .update(signed ?? raw)
    .digest(encoding);
  if (!secureEqual(expected, signature)) throw new IntegrationError("unauthorized", 401);
}
export function bodyHash(raw: Buffer) {
  return createHash("sha256").update(raw).digest("hex");
}
export async function rawBody(request: Request) {
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_048_576) throw new IntegrationError("validation_error", 413);
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
