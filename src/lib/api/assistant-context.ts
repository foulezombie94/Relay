import "server-only";
import { ApiError, databaseError } from "./context";
import { db } from "@/lib/supabase/server";
import {
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
        security_notices: [],
      };
    }
    return { ...m, sources: visible.filter((s) => used.includes(s.id)) };
  });
}
