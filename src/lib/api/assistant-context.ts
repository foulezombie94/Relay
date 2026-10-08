import "server-only";
import { createHash } from "node:crypto";
import { ApiError, databaseError } from "./context";
import { db } from "@/lib/supabase/server";
import {
  assistantOutput,
  conversationMessages,
  type AssistantConversation,
  type AssistantMessage,
  type AssistantSource,
} from "@/lib/domain/assistant";

type Client = Awaited<ReturnType<typeof db>>;
export type SourceContent = AssistantSource & { content: string; private?: boolean };

export async function ownedConversation(
  client: Client,
  workspace: string,
  user: string,
  id: string,
) {
  const result = await client
    .from("ai_conversations")
    .select("id,title,messages,updated_at")
    .eq("workspace_id", workspace)
    .eq("user_id", user)
    .eq("id", id)
    .maybeSingle();
  databaseError(result.error);
  if (!result.data) throw new ApiError("Cette conversation est inaccessible.", 404);
  return {
    ...result.data,
    messages: conversationMessages(result.data.messages),
  } as AssistantConversation;
}

export async function visibleHistory(
  client: Client,
  workspace: string,
  messages: AssistantMessage[],
) {
  const ids = [
    ...new Set(
      messages.flatMap((m) => [
        ...(m.source_ids ?? []),
        ...(m.citations ?? []).map((c) => c.source_id),
        ...(m.sources ?? []).map((s) => s.id),
        ...(m.proposals ?? []).flatMap((p) => [
          p.source_id,
          ...(p.source_b_id ? [p.source_b_id] : []),
        ]),
      ]),
    ),
  ].filter((id) => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id));
  const refs = messages.flatMap((m) => m.sources ?? []).filter((s) => ids.includes(s.id));
  // Legacy conversations did not necessarily persist every source type.
  for (const id of ids)
    if (!refs.some((s) => s.id === id)) {
      for (const type of ["record", "note", "meeting"] as const)
        refs.push({ id, type, label: "", record_id: null });
    }
  const unique = [...new Map(refs.map((s) => [s.type + ":" + s.id, s])).values()];
  const visible: AssistantSource[] = [];
  for (let offset = 0; offset < Math.max(1, unique.length); offset += 600) {
    const result = await client.rpc("agent_visible_sources", {
      w: workspace,
      refs: unique.slice(offset, offset + 600),
    });
    databaseError(result.error);
    visible.push(...(result.data ?? []));
  }
  const access = await client.rpc("agent_access_fingerprint", { w: workspace });
  databaseError(access.error);
  return messages.map((m) => {
    if (m.role !== "assistant") return m;
    const used = [
      ...new Set([
        ...(m.source_ids ?? []),
        ...(m.citations ?? []).map((c) => c.source_id),
        ...(m.sources ?? []).map((s) => s.id),
        ...(m.proposals ?? []).flatMap((p) => [
          p.source_id,
          ...(p.source_b_id ? [p.source_b_id] : []),
        ]),
      ]),
    ];
    if (
      (m.access_fingerprint && m.access_fingerprint !== access.data) ||
      used.some((id) => !visible.some((s) => s.id === id))
    ) {
      return {
        ...m,
        answer:
          "Certaines sources de cette réponse ne sont plus accessibles. Relancez la question avec vos accès actuels.",
        sources: [],
        source_ids: [],
        proposals: [],
        citations: [],
        accepted: {},
        actions: [],
      };
    }
    return { ...m, sources: visible.filter((s) => used.includes(s.id)) };
  });
}

export function proposalId(conversation: string, message: string, index: number) {
  const hash = createHash("sha256")
    .update(`relay-assistant:${conversation}:${message}:${index}`)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export async function acceptProposal(
  client: Client,
  workspace: string,
  user: string,
  conversationId: string,
  messageId: string,
  index: number,
) {
  const conversation = await ownedConversation(client, workspace, user, conversationId);
  const message = conversation.messages.find((m) => m.id === messageId && m.state !== "pending");
  const parsed = assistantOutput.shape.proposals
    .unwrap()
    .element.safeParse(message?.proposals?.[index]);
  if (!parsed.success) throw new ApiError("Cette proposition n’est plus disponible.", 404);
  const safe = await visibleHistory(client, workspace, [message!]);
  if (!safe[0].proposals?.[index])
    throw new ApiError("Les permissions de cette proposition ont changé.", 403);
  const privacy = await client.rpc("agent_sources_private", {
    w: workspace,
    refs: (message?.sources ?? []).map(({ id, type }) => ({ id, type })),
  });
  databaseError(privacy.error);
  const p = parsed.data;
  const source = async (id: string) => {
    const type = message?.sources?.find((s) => s.id === id)?.type;
    const kinds =
      type === "email"
        ? ["communications"]
        : type === "meeting"
          ? ["meetings"]
          : type === "note"
            ? ["notes"]
            : ["notes", "meetings"];
    for (const table of kinds) {
      const r = await client
        .from(table)
        .select(
          table === "notes"
            ? "id,title,record_id,content,private"
            : table === "communications"
              ? "id,subject,record_id,body,user_id"
              : "id,title,record_id,transcript,summary,private",
        )
        .eq("workspace_id", workspace)
        .eq("id", id)
        .maybeSingle();
      databaseError(r.error);
      if (r.data) {
        const data = r.data as unknown as Record<string, unknown>;
        return {
          type: table === "communications" ? "email" : table === "notes" ? "note" : "meeting",
          private: !!data.private || table === "communications",
          label: String(data.title || data.subject || "Source"),
          record_id: data.record_id as string | null,
          content: String(data.content ?? data.body ?? (data.transcript || data.summary || "")),
        };
      }
    }
    throw new ApiError("La source n’est plus accessible.", 403);
  };
  const a = await source(p.source_id);
  const b = p.type === "conflict" && p.source_b_id ? await source(p.source_b_id) : null;
  if (
    !p.source_quote ||
    !a.content.includes(p.source_quote) ||
    (p.type === "conflict" && (!b || !p.source_b_quote || !b.content.includes(p.source_b_quote)))
  )
    throw new ApiError(
      "Les sources ont changé. Relancez l’analyse avant d’ajouter cette proposition.",
      409,
    );
  const resource = p.type === "commitment" ? "commitments" : "conflicts";
  const id = proposalId(conversationId, messageId, index);
  const values: Record<string, unknown> =
    p.type === "commitment"
      ? {
          id,
          workspace_id: workspace,
          title: p.title,
          status: "proposed",
          record_id: a.record_id,
          source_type: a.type,
          source_id: p.source_id,
          source_quote: p.source_quote,
          uncertainty: p.uncertainty ?? "",
          private: a.private || privacy.data,
          author_id: user,
        }
      : {
          id,
          workspace_id: workspace,
          title: p.title,
          status: "open",
          private: a.private || b?.private || privacy.data,
          author_id: user,
          record_id: a.record_id,
          field: p.field || "À préciser",
          source_a: { label: a.label, quote: p.source_quote, value: p.source_quote },
          source_b: { label: b!.label, quote: p.source_b_quote!, value: p.source_b_quote! },
        };
  const existing = await client
    .from(resource)
    .select("id")
    .eq("id", id)
    .eq("workspace_id", workspace)
    .maybeSingle();
  databaseError(existing.error);
  if (!existing.data) {
    const created = await client.from(resource).insert(values);
    if (created.error?.code === "23505") {
      const duplicate = await client
        .from(resource)
        .select("id")
        .eq("id", id)
        .eq("workspace_id", workspace)
        .maybeSingle();
      databaseError(duplicate.error);
      if (!duplicate.data) databaseError(created.error);
    } else databaseError(created.error);
  }
  const messages = conversation.messages.map((m) =>
    m.id === messageId ? { ...m, accepted: { ...m.accepted, [index]: { id, resource } } } : m,
  );
  // A concurrent chat update wins. The stable entity id still prevents a duplicate on retry.
  const saved = await client
    .from("ai_conversations")
    .update({ messages, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspace)
    .eq("user_id", user)
    .eq("id", conversationId)
    .eq("updated_at", conversation.updated_at);
  databaseError(saved.error);
  return { id, resource };
}
