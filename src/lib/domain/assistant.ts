import { z } from "zod";

export const assistantOutput = z.object({
  answer: z.string().min(1).max(20000),
  source_ids: z.array(z.uuid()).max(30).default([]),
  citations: z
    .array(z.object({ source_id: z.uuid(), quote: z.string().trim().min(1).max(2000) }).strict())
    .max(30)
    .default([]),
  proposals: z
    .array(
      z.object({
        type: z.enum(["commitment", "conflict"]),
        title: z.string().trim().min(1).max(300),
        source_id: z.uuid(),
        source_quote: z.string().trim().min(1).max(2000),
        uncertainty: z.string().max(2000).optional(),
        field: z.string().max(100).optional(),
        source_b_id: z.uuid().optional(),
        source_b_quote: z.string().trim().min(1).max(2000).optional(),
      }),
    )
    .max(20)
    .default([]),
});
export type AssistantProposal = z.infer<typeof assistantOutput>["proposals"][number];
export type AssistantSource = {
  id: string;
  type:
    | "record"
    | "note"
    | "meeting"
    | "email"
    | "calendar"
    | "task"
    | "commitment"
    | "document"
    | "conflict"
    | "list"
    | "pipeline"
    | "workflow";
  label: string;
  record_id: string | null;
  object_id?: string;
};
export type AssistantStep = {
  id: string;
  label: string;
  detail?: string;
  status: "running" | "done" | "error";
  elapsed_ms?: number;
};
export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content?: string;
  answer?: string;
  created_at?: string;
  request_id?: string;
  record_id?: string | null;
  state?: "pending" | "complete" | "stopped" | "error";
  source_ids?: string[];
  citations?: z.infer<typeof assistantOutput>["citations"];
  proposals?: AssistantProposal[];
  sources?: AssistantSource[];
  steps?: AssistantStep[];
  model?: string;
  elapsed_ms?: number;
  actions?: import("@/lib/agent/contracts").AgentAction[];
  security_notices?: import("@/lib/agent/security").SecurityNotice[];
  access_fingerprint?: string;
  partial?: boolean;
  error_code?: string;
  retry_after?: number;
  accepted?: Record<string, { id: string; resource: string }>;
};
export type AssistantConversation = {
  id: string;
  title: string;
  updated_at: string;
  messages: AssistantMessage[];
};
export type AssistantEvent =
  | { type: "conversation"; id: string; title: string; user: AssistantMessage; message_id: string }
  | { type: "step"; step: AssistantStep }
  | { type: "text"; text: string }
  | { type: "complete"; message: AssistantMessage }
  | { type: "error"; error: string; status?: number; code?: string; retry_after?: number };

export const assistantPrompts = [
  {
    title: "Faire le point sur un client",
    description: "Informations clés et prochaines actions",
    prompt:
      "Résume les informations documentées sur ce client et indique les prochaines actions à envisager.",
  },
  {
    title: "Préparer mon prochain rendez-vous",
    description: "Contexte, engagements et questions à poser",
    prompt:
      "À partir des réunions et notes accessibles, prépare un brief pour mon prochain rendez-vous : contexte, engagements et questions à poser.",
  },
  {
    title: "Retrouver les engagements",
    description: "Les promesses à examiner dans vos échanges",
    prompt:
      "Extrais les engagements documentés dans les notes et réunions. Cite les sources et garde les incertitudes visibles.",
  },
  {
    title: "Clarifier les contradictions",
    description: "Comparer les informations avant de décider",
    prompt:
      "Repère les contradictions explicitement documentées entre les échanges, uniquement quand les conditions et dates sont comparables.",
  },
];

export function conversationMessages(value: unknown): AssistantMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .slice(0, 40)
    .map((m, i) => ({
      ...m,
      id: typeof m.id === "string" ? m.id : "legacy-" + i,
      content: typeof m.content === "string" ? m.content.slice(0, 4000) : undefined,
      answer: typeof m.answer === "string" ? m.answer.slice(0, 20000) : undefined,
      source_ids: Array.isArray(m.source_ids)
        ? m.source_ids.filter((id: unknown) => typeof id === "string").slice(0, 30)
        : [],
      sources: Array.isArray(m.sources)
        ? m.sources
            .filter(
              (s: unknown) =>
                s && typeof s === "object" && typeof (s as AssistantSource).id === "string",
            )
            .slice(0, 400)
        : [],
      citations: assistantOutput.shape.citations.safeParse(m.citations).success
        ? assistantOutput.shape.citations.parse(m.citations)
        : [],
      proposals: Array.isArray(m.proposals)
        ? m.proposals.slice(0, 20).flatMap((p: unknown) => {
            const parsed = assistantOutput.shape.proposals.unwrap().element.safeParse(p);
            return parsed.success ? [parsed.data] : [];
          })
        : [],
      steps: Array.isArray(m.steps)
        ? m.steps
            .filter(
              (s: unknown) =>
                s && typeof s === "object" && typeof (s as AssistantStep).id === "string",
            )
            .slice(0, 40)
        : [],
    }));
}

// Only decode the public answer field. Provider reasoning is never displayed.
export function partialAssistantAnswer(json: string): string {
  const match = /^\s*\{\s*"answer"\s*:\s*"/.exec(json);
  if (!match) return "";
  let text = "";
  const escapes: Record<string, string> = {
    n: "\n",
    r: "\r",
    t: "\t",
    b: "\b",
    f: "\f",
    '"': '"',
    "\\": "\\",
    "/": "/",
  };
  for (let i = match[0].length; i < json.length; i++) {
    const char = json[i];
    if (char === '"') break;
    if (char !== "\\") {
      text += char;
      continue;
    }
    const next = json[++i];
    if (!next) break;
    if (next === "u") {
      const hex = json.slice(i + 1, i + 5);
      if (!/^[\da-f]{4}$/i.test(hex)) break;
      text += String.fromCharCode(parseInt(hex, 16));
      i += 4;
    } else if (next in escapes) text += escapes[next];
    else break;
  }
  return text;
}
