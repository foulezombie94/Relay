import type { NextRequest } from "next/server";
import { ApiError } from "./context";
export async function workflowBody(req: NextRequest, maximum = 16000) {
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError("Requête vide.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new ApiError("Requête trop volumineuse.", 413);
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}
