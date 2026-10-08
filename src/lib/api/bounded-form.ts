import "server-only";
import { ApiError } from "./context";
export async function boundedFormData(request: Request, maxBytes: number) {
  const length = Number(request.headers.get("content-length"));
  if (length > maxBytes) throw new ApiError("Fichier trop volumineux.", 413);
  if (!request.body) throw new ApiError("Corps du formulaire absent.");
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) throw new ApiError("Formulaire trop volumineux.", 413);
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return new Response(Buffer.concat(chunks), {
    headers: { "Content-Type": request.headers.get("content-type") ?? "" },
  }).formData();
}
