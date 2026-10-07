import type { AssistantEvent } from "@/lib/domain/assistant";

export async function readAssistantStream(
  response: Response,
  receive: (event: AssistantEvent) => void,
) {
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "L’assistant est indisponible.");
  }
  if (!response.body) throw new Error("La réponse n’a pas pu être ouverte.");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    terminal = false;
  try {
    while (true) {
      const part = await reader.read();
      buffer += decoder.decode(part.value, { stream: !part.done });
      if (buffer.length > 512000) throw new Error("La réponse est trop volumineuse.");
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      if (part.done && buffer.trim()) {
        lines.push(buffer);
        buffer = "";
      }
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as AssistantEvent;
        if (event.type === "complete" || event.type === "error") terminal = true;
        receive(event);
      }
      if (part.done) break;
    }
    if (!terminal)
      throw new Error("La connexion a été interrompue avant la fin. Relancez la question.");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
