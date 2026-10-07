import { describe, expect, it } from "vitest";
import { assistantOutput, conversationMessages, partialAssistantAnswer } from "./assistant";
import { readAssistantStream } from "@/components/assistant/stream";

describe("assistant public response streaming", () => {
  it("decodes split escapes and stops before sources or reasoning fields", () => {
    const answer = 'Résumé : café\nCitation : "accord". ☀';
    const json = JSON.stringify({ answer, source_ids: [], reasoning: "private reasoning" });
    for (let length = 0; length <= json.length; length++) {
      expect(answer.startsWith(partialAssistantAnswer(json.slice(0, length)))).toBe(true);
    }
    expect(partialAssistantAnswer(json)).toBe(answer);
    expect(partialAssistantAnswer('{"answer":"caf\\u00')).toBe("caf");
    expect(partialAssistantAnswer('{"answer":"caf\\u00e9"}')).toBe("café");
    expect(partialAssistantAnswer('{"reasoning":"secret","answer":"public"}')).toBe("");
  });
  it("rejects empty citations before an action can be proposed", () => {
    expect(
      assistantOutput.safeParse({
        answer: "Résumé",
        proposals: [
          {
            type: "commitment",
            title: "Livrer",
            source_id: "b795b95a-6f66-4d9f-b896-3820a33bfa2d",
            source_quote: " ",
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("preserves old conversations while dropping invalid proposals", () => {
    const messages = conversationMessages([
      { role: "user", content: "Question" },
      { role: "assistant", answer: "Réponse", proposals: [{}] },
      { role: "system", content: "ignore" },
    ]);
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({ id: "legacy-1", answer: "Réponse", proposals: [] });
  });
  it("handles NDJSON split across every UTF8 byte", async () => {
    const text =
      '{"type":"text","text":"Réponse café"}\n{"type":"complete","message":{"id":"a","role":"assistant","answer":"Réponse café"}}\n';
    const bytes = new TextEncoder().encode(text);
    const stream = new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    });
    const events: unknown[] = [];
    await readAssistantStream(new Response(stream), (event) => events.push(event));
    expect(events[0]).toEqual({ type: "text", text: "Réponse café" });
    expect(events).toHaveLength(2);
  });
  it("reports interrupted streams instead of pretending they completed", async () => {
    await expect(
      readAssistantStream(new Response('{"type":"text","text":"partiel"}\n'), () => {}),
    ).rejects.toThrow("avant la fin");
  });
  it("passes a server error without waiting for a completion event", async () => {
    const events: unknown[] = [];
    await readAssistantStream(new Response('{"type":"error","error":"Quota épuisé"}\n'), (event) =>
      events.push(event),
    );
    expect(events).toEqual([{ type: "error", error: "Quota épuisé" }]);
  });
});
