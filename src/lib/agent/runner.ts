import "server-only";
import { originalRequestMessage, untrustedToolMessage, sourceNotices } from "./security";
import {
  assistantOutput,
  type AssistantEvent,
  type AssistantMessage,
  type AssistantStep,
} from "@/lib/domain/assistant";
import { ApiError } from "@/lib/api/context";
import { executeTool, guard, propose, rpc, type ToolContext } from "./tools";
import { toolsForModel, readRequestKey, toolLabel } from "./contracts";
import { agentInstructions } from "./instructions";
import { directIdentityAnswer, configuredAgentProvider } from "./identity";
import { agentApiKey, agentEndpoint, agentProviderTools, agentProviderOptions } from "./provider";

// Provider output is bounded before JSON parsing; streams, tool arguments and errors
// cannot grow indefinitely. No unvalidated model text is displayed to the user.
async function providerJSON(response: Response) {
  if (!response.ok || !response.body)
    throw new ApiError("Le fournisseur IA est indisponible.", 502);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (true) {
      const part = await reader.read();
      text += decoder.decode(part.value, { stream: !part.done });
      if (text.length > 120000) throw new ApiError("Réponse fournisseur trop volumineuse.", 502);
      if (part.done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return JSON.parse(text);
}
export async function runAgent(
  c: ToolContext,
  options: {
    signal: AbortSignal;
    model: string;
    toolLimit: number;
    reservedTokens: number;
    outputTokens: number;
    record?: string;
    priorQuestions: string[];
    step: (id: string, label: string, status: AssistantStep["status"], detail?: string) => void;
    emit: (event: AssistantEvent) => void;
  },
) {
  c.untrustedContext ||= options.priorQuestions.length > 0;
  const definitions = agentProviderTools(toolsForModel());
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: agentInstructions(options.model) },
    {
      role: "user",
      content: JSON.stringify({
        untrusted_historical_context_not_authorization: options.priorQuestions,
      }),
    },
    originalRequestMessage(c.question, options.record, new Date().toISOString(), options.toolLimit),
  ];
  const access = await rpc(c.client, "agent_access_fingerprint", { w: c.workspace });
  let toolCalls = 0,
    inputTokens = 0,
    outputTokens = 0,
    estimated = 0,
    json = "",
    partial = false,
    completed = false;
  let cost = 0;
  const completedReads = new Set<string>();
  try {
    const identity = directIdentityAnswer(c.question, options.model);
    if (identity) {
      options.signal.throwIfAborted();
      await guard(c);
      options.step(
        "identity",
        "Réponse d’Ask Relay",
        "done",
        "Identité et modèle issus de la configuration du serveur.",
      );
      completed = true;
      return {
        ...assistantOutput.parse({ answer: identity }),
        sources: [],
        actions: [],
        security_notices: [],
        partial: false,
        access_fingerprint: access,
      } satisfies Partial<AssistantMessage>;
    }
    for (let round = 0; round <= options.toolLimit; round++) {
      options.signal.throwIfAborted();
      await guard(c);
      const prompt = JSON.stringify(messages);
      // A UTF-8 byte upper bound is conservative for supported tokenizers. The
      // same reservation covers every successive call, including tool context.
      estimated +=
        Buffer.byteLength(prompt) +
        Buffer.byteLength(JSON.stringify(definitions)) +
        options.outputTokens;
      if (estimated > options.reservedTokens)
        throw new ApiError(
          "Budget IA atteint. Réduisez le périmètre ou ouvrez une nouvelle recherche.",
          429,
        );
      options.step("model-" + round, "Analyse des sources et sélection des outils", "running");
      const exhausted = toolCalls >= options.toolLimit;
      const response = await fetch(agentEndpoint(), {
        method: "POST",
        headers: {
          Authorization: "Bearer " + agentApiKey(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          ...agentProviderOptions(exhausted),
          max_completion_tokens: options.outputTokens,
          ...(configuredAgentProvider() === "groq" && exhausted
            ? {}
            : {
                tools: definitions,
                parallel_tool_calls: false,
                tool_choice: exhausted ? "none" : "auto",
              }),
          messages,
        }),
        redirect: "error",
        signal: options.signal,
      });
      const data = await providerJSON(response);
      if (
        !Number.isSafeInteger(data.usage?.prompt_tokens) ||
        data.usage.prompt_tokens < 0 ||
        !Number.isSafeInteger(data.usage?.completion_tokens) ||
        data.usage.completion_tokens < 0
      )
        throw new ApiError("Usage IA non confirmé ; réservation conservée.", 502);
      inputTokens += data.usage.prompt_tokens;
      outputTokens += data.usage.completion_tokens;
      const choice = data.choices?.[0];
      if (!choice || choice.finish_reason === "length")
        throw new ApiError("Réponse IA incomplète. Affinez la demande.", 502);
      const message = choice.message;
      options.step("model-" + round, "Analyse des sources terminée", "done");
      const calls = message?.tool_calls;
      if (!calls?.length) {
        json = message?.content ?? "";
        break;
      }
      if (!Array.isArray(calls) || calls.length !== 1 || toolCalls >= options.toolLimit)
        throw new ApiError("Le modèle a dépassé son budget d’outils.", 429);
      const call = calls[0];
      if (
        typeof call.id !== "string" ||
        call.id.length > 200 ||
        typeof call.function?.arguments !== "string" ||
        call.function.arguments.length > 65536
      )
        throw new ApiError("Appel d’outil invalide.", 502);
      messages.push({ role: "assistant", content: null, tool_calls: calls });
      const name = String(call.function.name);
      const admitted = await rpc(c.client, "agent_runtime", {
        w: c.workspace,
        operation: "tool",
        payload: { id: c.run, secret: c.runSecret, tool: name },
      });
      toolCalls++;
      const began = Date.now(),
        id = "tool-" + toolCalls;
      const label = toolLabel(name);
      options.step(id, label, "running");
      let result: unknown;
      try {
        const raw = JSON.parse(call.function.arguments);
        const key = readRequestKey(name, raw);
        if (key && completedReads.has(key))
          throw new ApiError(
            "Cette lecture identique a déjà réussi dans ce tour. Utilisez son résultat, le curseur suivant, un passage ou un filtre pertinent différent.",
            409,
          );
        result = await executeTool(c, name, raw, call.id);
        if (key) completedReads.add(key);
        else completedReads.clear();
        const encoded = JSON.stringify(result);
        if (encoded.length > 40000)
          throw new ApiError("Résultat trop volumineux. Affinez la recherche.", 413);
        partial ||= !!(result as { partial?: boolean })?.partial;
        if (sourceNotices(c.sources.values()).length)
          options.step(
            "source-security",
            "Instruction suspecte ignorée dans une source",
            "done",
            "Les sources ne donnent aucune autorisation d’action. Vous pourrez les lire dans le chat.",
          );
        options.step(
          id,
          label,
          "done",
          (result as { partial?: boolean })?.partial
            ? "Résultat partiel ; pagination ou contenu limité."
            : undefined,
        );
        await rpc(c.client, "agent_runtime", {
          w: c.workspace,
          operation: "tool_finish",
          payload: {
            id: c.run,
            secret: c.runSecret,
            sequence: admitted.sequence,
            status: "done",
            duration_ms: Date.now() - began,
            resource_ids: [...c.sources.keys()].slice(-20),
          },
        });
      } catch (error) {
        c.untrustedContext = true;
        result = {
          error:
            error instanceof ApiError
              ? error.message
              : "Paramètres invalides ou opération indisponible.",
        };
        options.step(id, label, "error", (result as { error: string }).error);
        await rpc(c.client, "agent_runtime", {
          w: c.workspace,
          operation: "tool_finish",
          payload: {
            id: c.run,
            secret: c.runSecret,
            sequence: admitted.sequence,
            status: "error",
            duration_ms: Date.now() - began,
          },
        }).catch(() => {});
        if (error instanceof ApiError && error.status === 403) throw error;
      }
      messages.push(untrustedToolMessage(call.id, result));
      if (toolCalls >= options.toolLimit)
        messages.push({
          role: "system",
          content:
            "Budget d’outils atteint. Termine en JSON en indiquant toute recherche manquante et les résultats partiels.",
        });
    }
    options.signal.throwIfAborted();
    await guard(c);
    const data = assistantOutput.parse(JSON.parse(json));
    // All consulted sources are re-authorized, even those omitted from citations.
    // This prevents a revoked source from surviving inside the generated prose.
    const visible = await rpc(c.client, "agent_visible_sources", {
      w: c.workspace,
      refs: [...c.sources.values()].map(({ id, type }) => ({ id, type })),
    });
    const currentAccess = await rpc(c.client, "agent_access_fingerprint", { w: c.workspace });
    if (
      currentAccess !== access ||
      [...c.sources.keys()].some((id) => !visible.some((s: { id: string }) => s.id === id))
    )
      throw new ApiError("Les permissions ont changé. Relancez l’analyse.", 403);
    data.source_ids = data.source_ids.filter((id) => c.sources.has(id));
    for (const citation of data.citations) {
      const source = c.sources.get(citation.source_id);
      if (
        !source ||
        !(await rpc(c.client, "agent_validate_quote", {
          w: c.workspace,
          kind: source.type,
          source: source.id,
          quote: citation.quote,
        }))
      )
        throw new ApiError(
          "Une citation ne correspond plus à une source autorisée. Relancez l’analyse.",
          502,
        );
    }
    const quotations = [
      ...data.answer.matchAll(/«\s*([^»]{10,2000})\s*»|"([^"\n]{10,2000})"/g),
    ].map((m) => (m[1] ?? m[2]).trim());
    if (
      quotations.some(
        (q) =>
          !c.question.includes(q) &&
          !data.citations.some((s) => s.quote === q) &&
          ![...c.sources.values()].some((s) => s.label === q),
      )
    )
      throw new ApiError(
        "Une citation de la réponse ne peut pas être vérifiée. Relancez l’analyse.",
        502,
      );
    const checked = await Promise.all(
      data.proposals.map(async (p) => {
        const a = c.sources.get(p.source_id),
          b = p.source_b_id ? c.sources.get(p.source_b_id) : undefined;
        return (
          !!a &&
          ["note", "meeting", "email"].includes(a.type) &&
          (await rpc(c.client, "agent_validate_quote", {
            w: c.workspace,
            kind: a.type,
            source: a.id,
            quote: p.source_quote,
          })) &&
          (p.type !== "conflict" ||
            (!!b &&
              b.id !== a.id &&
              ["note", "meeting", "email"].includes(b.type) &&
              !!p.source_b_quote &&
              (await rpc(c.client, "agent_validate_quote", {
                w: c.workspace,
                kind: b.type,
                source: b.id,
                quote: p.source_b_quote,
              }))))
        );
      }),
    );
    data.proposals = data.proposals.filter((_, index) => checked[index]);
    const membership = await c.client
      .from("memberships")
      .select("role")
      .eq("workspace_id", c.workspace)
      .eq("user_id", c.user)
      .maybeSingle();
    if (membership.data && membership.data.role !== "viewer") {
      for (const [index, p] of data.proposals.entries()) {
        options.signal.throwIfAborted();
        const a = c.sources.get(p.source_id)!,
          b = p.source_b_id ? c.sources.get(p.source_b_id)! : undefined;
        await propose(
          c,
          p.type === "commitment" ? "propose_commitment" : "propose_conflict",
          p.type === "commitment"
            ? {
                title: p.title,
                record_id: a.record_id,
                source_type: a.type,
                source_id: a.id,
                source_quote: p.source_quote,
                uncertainty: p.uncertainty ?? "",
              }
            : {
                title: p.title,
                record_id: a.record_id,
                field: p.field ?? "À préciser",
                source_a_id: a.id,
                source_a_type: a.type,
                source_b_id: b!.id,
                source_b_type: b!.type,
                source_a: { label: a.label, quote: p.source_quote, value: p.source_quote },
                source_b: { label: b!.label, quote: p.source_b_quote!, value: p.source_b_quote! },
              },
          `${c.requestKey ?? c.run}:proposal:${index}`,
        );
      }
      data.proposals = [];
    }
    if (partial)
      data.answer +=
        "\n\nPérimètre partiel : certaines pages ou certains contenus restent à consulter. Les emails couvrent les éléments importés, pas nécessairement toute la boîte.";
    const sources = [...c.sources.values()].map(({ id, type, record_id, label, object_id }) => ({
      id,
      type,
      record_id,
      label,
      object_id,
    }));
    // Keep every dependency, not merely citations, for later revocation checks.
    const actions = [...c.actions.values()];
    if (
      (!actions.length || actions.some((a) => !["sent", "completed"].includes(a.status))) &&
      /(?:j[’']ai|nous avons|(?:e-?mail|email|message|la tâche|le rendez-vous|la note|la fiche|le workflow))\s+(?:a été\s+|été\s+)?(?:bien\s+)?(?:envoy[ée]+|cré[ée]+|modifi[ée]+|annul[ée]+)(?![\p{L}\p{N}_])/iu.test(
        data.citations.reduce(
          (answer, citation) => answer.replaceAll(citation.quote, "[Citation vérifiée]"),
          data.answer,
        ),
      )
    ) {
      data.answer =
        "Les recherches sont terminées. Les actions et leurs statuts réels sont affichés ci-dessous ; les actions à examiner nécessitent votre confirmation." +
        (partial ? " L’analyse des sources est partielle." : "");
    }
    options.step(
      "review",
      "Sources et citations vérifiées",
      "done",
      `${sources.length} sources consultées ; ${actions.length} actions préparées.`,
    );
    completed = true;
    return {
      ...data,
      sources,
      actions,
      security_notices: sourceNotices(c.sources.values()),
      partial,
      access_fingerprint: access,
    } satisfies Partial<AssistantMessage>;
  } finally {
    const inputRate = Math.max(0, Number(process.env.AGENT_INPUT_USD_PER_MILLION) || 0.4),
      outputRate = Math.max(0, Number(process.env.AGENT_OUTPUT_USD_PER_MILLION) || 1.6);
    cost = Math.ceil(inputTokens * inputRate + outputTokens * outputRate);
    await rpc(c.client, "agent_runtime", {
      w: c.workspace,
      operation: "finish",
      payload: {
        id: c.run,
        secret: c.runSecret,
        status: completed ? "complete" : "error",
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_microusd: cost,
      },
    }).catch(() => {});
  }
}
