import "server-only";
import { hydrateEmail } from "@/lib/integrations/email-content";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateAttributes } from "@/lib/domain/attributes";
import type { Attribute } from "@/lib/domain/types";
import { ApiError, databaseError } from "@/lib/api/context";
import {
  actionSchemas,
  toolSchemas,
  explicitEmailRecipient,
  explicitContactName,
  sensitiveEmail,
  type ToolName,
  type AgentAction,
  type ActionKind,
} from "./contracts";
import type { SourceContent } from "@/lib/api/assistant-context";
import { actionSecurity, explicitBulkRequest } from "./security";
import type { ActionSecurity } from "./security";

export type ToolContext = {
  client: SupabaseClient;
  workspace: string;
  user: string;
  conversation: string;
  run: string;
  runSecret?: string;
  readonly question: string;
  untrustedContext?: boolean;
  requestKey?: string;
  actionSequence?: Map<string, number>;
  sources: Map<string, SourceContent>;
  actions: Map<string, AgentAction>;
};
const searchKinds: Record<string, string> = {
  search_records: "record",
  search_emails: "email",
  search_calendar: "calendar",
  search_meetings: "meeting",
  search_notes: "note",
  search_tasks: "task",
  search_commitments: "commitment",
  search_documents: "document",
  search_conflicts: "conflict",
  search_lists: "list",
  search_pipelines: "pipeline",
  search_workflows: "workflow",
};
export async function rpc(client: SupabaseClient, name: string, args: Record<string, unknown>) {
  const r = await client.rpc(name, args);
  if (r.error?.code === "53300") {
    const reasons: Record<string, [string, string]> = {
      "Agent already running": [
        "Une analyse est déjà en cours. Attendez sa fin avant de réessayer.",
        "agent_busy",
      ],
      "Daily agent quota exceeded": [
        "La limite quotidienne d’analyses de cet espace est atteinte. Elle se renouvelle à minuit UTC.",
        "agent_daily_quota",
      ],
      "Monthly agent quota exceeded": [
        "Le budget mensuel IA de cet espace est atteint. Consultez l’utilisation dans les paramètres.",
        "agent_monthly_quota",
      ],
      "Tool budget exceeded": [
        "Le budget de cette analyse est atteint. Demandez à approfondir dans un nouveau tour.",
        "agent_run_budget",
      ],
      "External daily quota exceeded": [
        "Le quota quotidien d’envois ou de rendez-vous est atteint.",
        "external_daily_quota",
      ],
    };
    const [message, code] = reasons[r.error.message] ?? [
      "La capacité ou le quota est atteint. Consultez le statut et l’utilisation avant de réessayer.",
      "agent_capacity",
    ];
    throw Object.assign(new ApiError(message, 429), {
      code,
      ...(code === "agent_busy" ? { retryAfter: 5 } : {}),
    });
  }
  if (r.error?.code === "40001")
    throw new ApiError(
      "L’élément a changé ou l’action est déjà en cours. Actualisez son statut.",
      409,
    );
  if (r.error?.code === "22023")
    throw new ApiError("Ce filtre ou cette action n’est pas applicable à la ressource.", 400);
  databaseError(r.error);
  return r.data;
}
export async function guard(c: ToolContext, write = false) {
  const r = await c.client
    .from("memberships")
    .select("role")
    .eq("workspace_id", c.workspace)
    .eq("user_id", c.user)
    .maybeSingle();
  databaseError(r.error);
  if (!r.data || (write && r.data.role === "viewer"))
    throw new ApiError("Vos droits ne permettent plus cette opération.", 403);
}
function remember(
  c: ToolContext,
  result: {
    data?: Array<{
      id: string;
      type: SourceContent["type"];
      record_id: string | null;
      label: string;
      content: string;
      metadata: { private?: boolean; object_id?: string };
      content_length: number;
    }>;
  },
) {
  for (const row of result.data ?? []) {
    const old = c.sources.get(row.id);
    c.sources.set(row.id, {
      id: row.id,
      type: row.type,
      record_id: row.record_id,
      label: row.label,
      object_id: row.metadata?.object_id,
      private: row.metadata?.private || row.type === "email" || row.type === "calendar",
      content:
        old && old.content.includes(row.content)
          ? old.content
          : [old?.content, row.content].filter(Boolean).join("\n\n[Autre extrait consulté]\n\n"),
    });
  }
  return result;
}
async function reviewForAction(
  c: ToolContext,
  kind: ActionKind,
  values: Record<string, unknown>,
): Promise<ActionSecurity> {
  const policy = actionSecurity(c.question, kind, values, c.sources.values(), c.untrustedContext);
  if (kind !== "draft_email") return policy;
  const draft = actionSchemas.draft_email.parse(values);
  const requested = explicitEmailRecipient(c.question);
  const name = explicitContactName(c.question);
  let lookup = c.client
    .from("records")
    .select("id,email", { count: "exact" })
    .eq("workspace_id", c.workspace)
    .eq("archived", false);
  lookup = name
    ? lookup.ilike("display_name", name.replace(/[\\%_]/g, "\\$&"))
    : lookup.ilike("email", draft.to.replace(/[\\%_]/g, "\\$&"));
  const candidates = await lookup.limit(2);
  databaseError(candidates.error);
  if (
    candidates.count !== 1 ||
    candidates.data?.[0]?.email?.toLowerCase() !== draft.to ||
    (draft.record_id && candidates.data?.[0]?.id !== draft.record_id) ||
    (!name && requested !== draft.to)
  ) {
    return {
      ...policy,
      automatic: false,
      risk: policy.risk === "high" ? "high" : "medium",
      reasons: [
        ...policy.reasons,
        "Le destinataire est ambigu ou ne correspond pas exactement à la demande reconnue. Vérifiez l’adresse affichée.",
      ],
    };
  }
  return policy;
}
export async function propose(c: ToolContext, kind: ActionKind, input: unknown, key: string) {
  await guard(c, true);
  const parsed = actionSchemas[kind].parse(input);
  const values = parsed as Record<string, unknown>;
  if (kind === "create_note" && [...c.sources.values()].some((s) => s.private))
    values.private = true;
  if (values.record_id) {
    const r = await c.client
      .from("records")
      .select("id")
      .eq("workspace_id", c.workspace)
      .eq("id", values.record_id)
      .eq("archived", false)
      .maybeSingle();
    databaseError(r.error);
    if (!r.data) throw new ApiError("Fiche inaccessible.", 403);
  }
  if (kind === "create_record" || kind === "update_record") {
    const updated = kind === "update_record" ? actionSchemas.update_record.parse(parsed) : null;
    const previous = updated
      ? await c.client
          .from("records")
          .select("object_id,attributes")
          .eq("workspace_id", c.workspace)
          .eq("id", updated.id)
          .maybeSingle()
      : null;
    if (previous) {
      databaseError(previous.error);
      if (!previous.data) throw new ApiError("Fiche inaccessible.", 403);
    }
    const object = updated
      ? previous!.data!.object_id
      : (parsed as { object_id: string }).object_id;
    const definitions = await c.client
      .from("attributes")
      .select("*")
      .eq("workspace_id", c.workspace)
      .eq("object_id", object);
    databaseError(definitions.error);
    const next =
      updated?.values.attributes ??
      (parsed as { attributes?: Record<string, unknown> }).attributes ??
      previous?.data?.attributes ??
      {};
    const issues = validateAttributes(
      next,
      definitions.data as Attribute[],
      previous?.data?.attributes,
    );
    if (issues.length) throw new ApiError(issues.join(" "), 400);
  }
  if (kind === "draft_email") {
    const draft = actionSchemas.draft_email.parse(parsed);
    const account = await c.client
      .from("integrations")
      .select("id")
      .eq("workspace_id", c.workspace)
      .eq("user_id", c.user)
      .eq("provider", draft.provider)
      .eq("status", "connected")
      .maybeSingle();
    databaseError(account.error);
    if (!account.data) throw new ApiError("Compte expéditeur inaccessible.", 403);
    if (draft.reply_to_id) {
      const email = await c.client
        .from("communications")
        .select("id,sender_email,integration_id")
        .eq("workspace_id", c.workspace)
        .eq("id", draft.reply_to_id)
        .eq("kind", "email")
        .maybeSingle();
      databaseError(email.error);
      if (
        !email.data ||
        email.data.integration_id !== account.data.id ||
        email.data.sender_email?.toLowerCase() !== draft.to
      )
        throw new ApiError(
          "Le destinataire ou compte de réponse ne correspond pas au message.",
          400,
        );
    }
  }
  if (kind === "propose_commitment") {
    const p = actionSchemas.propose_commitment.parse(parsed);
    const source = c.sources.get(p.source_id);
    if (
      !source ||
      source.type !== p.source_type ||
      !(await rpc(c.client, "agent_validate_quote", {
        w: c.workspace,
        kind: source.type,
        source: source.id,
        quote: p.source_quote,
      }))
    )
      throw new ApiError("Une citation autorisée et partageable est requise.", 403);
  }
  if (kind === "propose_conflict") {
    const conflict = actionSchemas.propose_conflict.parse(parsed);
    if (conflict.source_a_id === conflict.source_b_id)
      throw new ApiError("Deux sources distinctes sont requises.", 400);
    for (const [id, type, quote] of [
      [conflict.source_a_id, conflict.source_a_type, conflict.source_a.quote],
      [conflict.source_b_id, conflict.source_b_type, conflict.source_b.quote],
    ]) {
      if (
        !c.sources.has(id) ||
        c.sources.get(id)?.type !== type ||
        !(await rpc(c.client, "agent_validate_quote", {
          w: c.workspace,
          kind: type,
          source: id,
          quote,
        }))
      )
        throw new ApiError("Une citation actuelle autorisée est requise pour chaque source.", 403);
    }
  }
  const proposed = (await rpc(c.client, "agent_action", {
    w: c.workspace,
    operation: "propose",
    payload: {
      key,
      kind,
      input: parsed,
      conversation_id: c.conversation,
      run_id: c.run,
      source_refs: [...c.sources.values()].map(({ id, type }) => ({ id, type })),
    },
  })) as AgentAction;
  const a = (await rpc(c.client, "agent_review_action", {
    w: c.workspace,
    action_id: proposed.id,
    run_secret: c.runSecret,
    review: await reviewForAction(c, kind, values),
  })) as AgentAction;
  c.actions.set(a.id, a);
  return a;
}
export async function executeTool(c: ToolContext, name: string, raw: unknown, callKey: string) {
  if (!Object.hasOwn(toolSchemas, name)) throw new ApiError("Outil inconnu.", 400);
  await guard(c);
  const input = toolSchemas[name as ToolName].parse(raw) as Record<string, unknown>;
  if (
    name in searchKinds ||
    name === "aggregate_crm_data" ||
    name === "get_crm_schema" ||
    name === "get_source" ||
    name === "get_record" ||
    name === "get_email_thread" ||
    name === "get_action_status" ||
    name === "get_accounts"
  )
    c.untrustedContext = true;
  if (name in searchKinds)
    return remember(
      c,
      await rpc(c.client, "agent_search", {
        w: c.workspace,
        kind: searchKinds[name],
        filters: input,
      }),
    );
  if (name === "get_source" || name === "get_record") {
    const kind = name === "get_record" ? "record" : input.kind;
    if (kind === "email") await hydrateEmail(c.client, c.workspace, String(input.id));
    const result = remember(
      c,
      await rpc(c.client, "agent_search", {
        w: c.workspace,
        kind,
        source: input.id,
        content_offset: input.offset ?? 0,
      }),
    );
    if (name === "get_record") {
      const relations = await c.client
        .from("record_relations")
        .select("id,source_id,target_id,label")
        .eq("workspace_id", c.workspace)
        .or(`source_id.eq.${input.id},target_id.eq.${input.id}`)
        .order("id")
        .limit(21);
      databaseError(relations.error);
      return {
        ...result,
        relations: (relations.data ?? []).slice(0, 20),
        relations_partial: (relations.data?.length ?? 0) > 20,
      };
    }
    return result;
  }
  if (name === "get_email_thread") {
    const { id, ...filters } = input;
    return remember(
      c,
      await rpc(c.client, "agent_search", { w: c.workspace, kind: "thread", source: id, filters }),
    );
  }
  if (name === "get_accounts") {
    const r = await c.client
      .from("integrations")
      .select("id,provider,email,status,last_sync,sync_coverage")
      .eq("workspace_id", c.workspace)
      .eq("user_id", c.user)
      .eq("status", "connected")
      .limit(7);
    databaseError(r.error);
    return { data: r.data };
  }
  if (name === "get_crm_schema") {
    const r = await c.client
      .from("objects")
      .select("id,name,slug,attributes(key,name,type,required,options)")
      .eq("workspace_id", c.workspace)
      .order("id")
      .limit(51);
    databaseError(r.error);
    return { data: (r.data ?? []).slice(0, 50), partial: (r.data?.length ?? 0) > 50 };
  }
  if (name === "aggregate_crm_data") {
    const { kind, group_by, ...filters } = input;
    return rpc(c.client, "agent_aggregate", { w: c.workspace, kind, group_by, filters });
  }
  if (name === "get_action_status") {
    const a = (await rpc(c.client, "agent_action", {
      w: c.workspace,
      operation: "get",
      payload: { id: input.id },
    })) as AgentAction;
    for (const ref of a.source_refs ?? []) {
      if (!c.sources.has(ref.id))
        c.sources.set(ref.id, {
          id: ref.id,
          type: ref.type,
          record_id: null,
          label: "Source d’une action consultée",
          content: "",
          private: a.private_context,
        });
    }
    c.actions.set(a.id, a);
    return a;
  }
  if (name === "send_email") {
    await guard(c, true);
    const a = (await rpc(c.client, "agent_action", {
      w: c.workspace,
      operation: "get",
      payload: { id: input.draft_id },
    })) as AgentAction;
    if (a.kind !== "draft_email" || a.run_id !== c.run || !c.actions.has(a.id))
      throw new ApiError("Utilisez un brouillon préparé dans ce tour.", 403);
    const draft = actionSchemas.draft_email.parse(a.input);
    const policy = actionSecurity(
      c.question,
      "draft_email",
      draft,
      c.sources.values(),
      c.untrustedContext,
    );
    if (!policy.automatic || !a.security?.automatic)
      return { ...a, confirmation_required: true, reason: policy.reasons.join(" ") };
    // Deterministic direct authorization is intentionally narrow. Names, bulk,
    // sensitive text and old conversational consent always use the concrete preview.
    if (process.env.FEATURE_AGENT_DIRECT_SEND !== "true")
      return {
        ...a,
        confirmation_required: true,
        reason:
          "Confirmez le contenu avant l’envoi. L’envoi direct doit être activé après les tests fournisseurs.",
      };
    const requested = explicitEmailRecipient(c.question);
    const requestedName = explicitContactName(c.question);
    let lookup = c.client
      .from("records")
      .select("id,email", { count: "exact" })
      .eq("workspace_id", c.workspace)
      .eq("archived", false);
    lookup = requestedName
      ? lookup.ilike("display_name", requestedName.replace(/[\\%_]/g, "\\$&"))
      : lookup.ilike("email", draft.to.replace(/[\\%_]/g, "\\$&"));
    const candidates = await lookup.limit(2);
    databaseError(candidates.error);
    if (
      (!requestedName && requested !== draft.to) ||
      candidates.data?.[0]?.email?.toLowerCase() !== draft.to ||
      sensitiveEmail(draft.subject, draft.body) ||
      [...c.sources.values()].some(
        (s) => s.private && (!draft.record_id || s.record_id !== draft.record_id),
      ) ||
      candidates.count !== 1 ||
      (draft.record_id && candidates.data?.[0]?.id !== draft.record_id)
    ) {
      return {
        ...a,
        confirmation_required: true,
        reason:
          "Vérifiez le destinataire, le compte, l’objet et le contenu, puis confirmez l’envoi dans l’aperçu.",
      };
    }
    if (
      /rendez-vous|rendez vous|appointment|réunion|meeting|demain|tomorrow|\d{1,2}\s*h\b/i.test(
        c.question,
      )
    ) {
      return {
        ...a,
        confirmation_required: true,
        reason:
          "Vérifiez la date, le fuseau et le rendez-vous dans l’aperçu avant l’envoi de ce rappel.",
      };
    }
    const executed = (await rpc(c.client, "agent_apply", {
      w: c.workspace,
      action_id: a.id,
      expected_digest: a.confirmation_digest,
      run_secret: c.runSecret,
    })) as AgentAction;
    c.actions.set(executed.id, executed);
    return executed;
  }
  if (Object.hasOwn(actionSchemas, name)) {
    const sequence = c.actionSequence?.get(name) ?? 0;
    if (name === "draft_email" && sequence > 0 && !explicitBulkRequest(c.question))
      throw new ApiError(
        "Plusieurs emails nécessitent une demande explicite d’envoi multiple. Aucun envoi supplémentaire n’est autorisé.",
        400,
      );
    c.actionSequence?.set(name, sequence + 1);
    // A UI retry keeps the same request key. Different content for the same
    // logical action is refused, instead of producing a second external send.
    const singularAutomatic =
      (name === "create_task" || name === "create_note") &&
      actionSecurity(c.question, name, input, c.sources.values(), c.untrustedContext).automatic;
    const a = await propose(
      c,
      name as ActionKind,
      input,
      `${c.requestKey ?? c.run}:${name}:${singularAutomatic ? "explicit" : sequence}`,
    );
    if (
      name !== "draft_email" &&
      a.security?.automatic &&
      ["pending", "draft"].includes(a.status)
    ) {
      const executed = (await rpc(c.client, "agent_apply", {
        w: c.workspace,
        action_id: a.id,
        expected_digest: a.confirmation_digest,
        run_secret: c.runSecret,
      })) as AgentAction;
      c.actions.set(a.id, executed);
      return executed;
    }
    return a;
  }
  throw new ApiError("Outil inconnu : " + callKey, 400);
}
