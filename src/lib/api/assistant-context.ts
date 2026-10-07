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
        ...(m.sources ?? []).map((s) => s.id),
        ...(m.proposals ?? []).flatMap((p) => [
          p.source_id,
          ...(p.source_b_id ? [p.source_b_id] : []),
        ]),
      ]),
    ),
  ]
    .filter((id) => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id))
    .slice(0, 600);
  if (!ids.length) return messages;
  const results = await Promise.all([
    client
      .from("records")
      .select("id,display_name,object_id")
      .eq("workspace_id", workspace)
      .in("id", ids),
    client.from("notes").select("id,title,record_id").eq("workspace_id", workspace).in("id", ids),
    client
      .from("meetings")
      .select("id,title,record_id")
      .eq("workspace_id", workspace)
      .in("id", ids),
  ]);
  for (const r of results) databaseError(r.error);
  const visible: AssistantSource[] = [
    ...(results[0].data ?? []).map((r) => ({
      id: r.id,
      type: "record" as const,
      label: r.display_name,
      record_id: r.id,
      object_id: r.object_id,
    })),
    ...(results[1].data ?? []).map((r) => ({
      id: r.id,
      type: "note" as const,
      label: r.title || "Note",
      record_id: r.record_id,
    })),
    ...(results[2].data ?? []).map((r) => ({
      id: r.id,
      type: "meeting" as const,
      label: r.title,
      record_id: r.record_id,
    })),
  ];
  return messages.map((m) => {
    if (m.role !== "assistant") return m;
    const used = [
      ...new Set([
        ...(m.source_ids ?? []),
        ...(m.sources ?? []).map((s) => s.id),
        ...(m.proposals ?? []).flatMap((p) => [
          p.source_id,
          ...(p.source_b_id ? [p.source_b_id] : []),
        ]),
      ]),
    ];
    if (used.some((id) => !visible.some((s) => s.id === id))) {
      return {
        ...m,
        answer:
          "Certaines sources de cette réponse ne sont plus accessibles. Relancez la question avec vos accès actuels.",
        sources: [],
        source_ids: [],
        proposals: [],
        accepted: {},
      };
    }
    return { ...m, sources: visible.filter((s) => used.includes(s.id)) };
  });
}

export async function assistantSources(client: Client, workspace: string, record?: string) {
  let rq = client
    .from("records")
    .select("id,object_id,display_name,stage,amount,currency,close_date,attributes")
    .eq("workspace_id", workspace)
    .eq("archived", false);
  let nq = client
    .from("notes")
    .select("id,record_id,title,content,private")
    .eq("workspace_id", workspace);
  let mq = client
    .from("meetings")
    .select("id,record_id,title,starts_at,transcript,summary")
    .eq("workspace_id", workspace);
  if (record) {
    rq = rq.eq("id", record);
    nq = nq.eq("record_id", record);
    mq = mq.eq("record_id", record);
  }
  const results = await Promise.all([
    rq.order("created_at", { ascending: false }).limit(40),
    nq.order("created_at", { ascending: false }).limit(30),
    mq.order("created_at", { ascending: false }).limit(15),
  ]);
  for (const r of results) databaseError(r.error);
  if (record && !results[0].data?.length)
    throw new ApiError("Cette fiche n’est plus accessible.", 403);
  const groups: SourceContent[][] = [
    (results[0].data ?? []).map((r) => ({
      id: r.id,
      type: "record",
      record_id: r.id,
      object_id: r.object_id,
      label: r.display_name,
      content: JSON.stringify(r).slice(0, 1500),
    })),
    (results[1].data ?? []).map((r) => ({
      id: r.id,
      type: "note",
      record_id: r.record_id,
      label: r.title || "Note",
      content: String(r.content ?? "").slice(0, 4000),
      private: r.private,
    })),
    (results[2].data ?? []).map((r) => ({
      id: r.id,
      type: "meeting",
      record_id: r.record_id,
      label: r.title,
      content: String(r.transcript || r.summary || "").slice(0, 6000),
    })),
  ];
  // Reserve a budget for each kind of source so recent notes do not crowd out calls.
  return groups.flatMap((group) => {
    let remaining = 20000;
    return group.flatMap((source) => {
      if (!remaining || !source.content) return [];
      const content = source.content.slice(0, remaining);
      remaining -= content.length;
      return [{ ...source, content }];
    });
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
  const p = parsed.data;
  const source = async (id: string) => {
    const type = message?.sources?.find((s) => s.id === id)?.type;
    const kinds =
      type === "meeting" ? ["meetings"] : type === "note" ? ["notes"] : ["notes", "meetings"];
    for (const table of kinds) {
      const r = await client
        .from(table)
        .select(
          table === "notes"
            ? "id,title,record_id,content,private"
            : "id,title,record_id,transcript,summary",
        )
        .eq("workspace_id", workspace)
        .eq("id", id)
        .maybeSingle();
      databaseError(r.error);
      if (r.data) {
        const data = r.data as unknown as Record<string, unknown>;
        if (data.private)
          throw new ApiError(
            "Une note privée ne peut pas être partagée dans une proposition.",
            403,
          );
        return {
          type: table === "notes" ? "note" : "meeting",
          label: String(data.title || "Source"),
          record_id: data.record_id as string | null,
          content: String(data.content ?? (data.transcript || data.summary || "")),
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
        }
      : {
          id,
          workspace_id: workspace,
          title: p.title,
          status: "open",
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
