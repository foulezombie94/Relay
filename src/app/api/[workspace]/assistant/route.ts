import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID, randomBytes } from "node:crypto";
import { runAgent } from "@/lib/agent/runner";
import { configuredAgentModel } from "@/lib/agent/identity";
import { agentApiKey } from "@/lib/agent/provider";
import { assistantApprovalMode } from "@/lib/domain/assistant-approval";
import {
  skillError,
  skillEngine,
  loadSelectedSkill,
  skillSelectionSchema,
} from "@/lib/api/agent-skills";
import { rpc } from "@/lib/agent/tools";
import * as Sentry from "@sentry/nextjs";
import { context, checkOrigin, ApiError, databaseError, fail } from "@/lib/api/context";
import { workflowBody } from "@/lib/api/workflow-body";
import { ownedConversation, visibleHistory } from "@/lib/api/assistant-context";
import {
  type AssistantEvent,
  type AssistantMessage,
  type AssistantStep,
} from "@/lib/domain/assistant";

type P = { params: Promise<{ workspace: string }> };
export const runtime = "nodejs";
export const maxDuration = 90;
const model = configuredAgentModel;
const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ask"),
    message: z.string().trim().min(1).max(4000),
    record_id: z.uuid().optional(),
    meeting_id: z.uuid().optional(),
    conversation_id: z.uuid().optional(),
    deepen: z.boolean().optional(),
    approval_mode: assistantApprovalMode.default("review"),
    request_id: z.uuid().optional(),
    skill: skillSelectionSchema.optional(),
  }),
  z.object({
    action: z.literal("accept"),
    conversation_id: z.uuid(),
    message_id: z.string().min(1).max(80),
    index: z.number().int().min(0).max(19),
  }),
]);

export async function GET(req: NextRequest, { params }: P) {
  try {
    const { workspace } = await params;
    const { client, user } = await context(workspace);
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const conversation = await ownedConversation(client, workspace, user.id, z.uuid().parse(id));
      conversation.messages = await visibleHistory(client, workspace, conversation.messages);
      const actions = await rpc(client, "agent_action", {
        w: workspace,
        operation: "list",
        payload: { conversation_id: conversation.id },
      });
      const linked = new Set(
        conversation.messages.flatMap((m) => m.actions ?? []).map((a) => a.id),
      );
      const unlinked = actions.filter((a: { id: string }) => !linked.has(a.id));
      conversation.messages = conversation.messages.map((m, i) => ({
        ...m,
        actions: [
          ...(m.actions ?? []).flatMap((a) =>
            actions.find((fresh: { id: string }) => fresh.id === a.id)
              ? [actions.find((fresh: { id: string }) => fresh.id === a.id)]
              : [],
          ),
          ...(i === conversation.messages.length - 1 ? unlinked : []),
        ],
      }));
      return NextResponse.json(
        { data: conversation },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const result = await client
      .from("ai_conversations")
      .select("id,title,updated_at")
      .eq("workspace_id", workspace)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(40);
    databaseError(result.error);
    return NextResponse.json(
      {
        configured: !!agentApiKey(),
        model: model(),
        conversations: result.data ?? [],
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: NextRequest, { params }: P) {
  try {
    checkOrigin(req);
    const { workspace } = await params;
    const { client, user } = await context(workspace);
    const input = z
      .object({ id: z.uuid(), title: z.string().trim().min(1).max(100) })
      .parse(JSON.parse(await workflowBody(req, 2000)));
    await ownedConversation(client, workspace, user.id, input.id);
    const result = await client
      .from("ai_conversations")
      .update({ title: input.title })
      .eq("id", input.id)
      .eq("workspace_id", workspace)
      .eq("user_id", user.id)
      .select("id")
      .single();
    databaseError(result.error);
    return NextResponse.json({ data: result.data });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest, { params }: P) {
  try {
    checkOrigin(req);
    const { workspace } = await params;
    const { client, user } = await context(workspace);
    const id = z.uuid().parse(req.nextUrl.searchParams.get("id"));
    await ownedConversation(client, workspace, user.id, id);
    const result = await client
      .from("ai_conversations")
      .delete()
      .eq("workspace_id", workspace)
      .eq("user_id", user.id)
      .eq("id", id);
    databaseError(result.error);
    return NextResponse.json({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest, { params }: P) {
  try {
    checkOrigin(req);
    const { workspace } = await params;
    const input = requestSchema.parse(JSON.parse(await workflowBody(req, 70000)));
    const { client, user, role } = await context(workspace, input.action === "accept");
    if (input.action === "accept")
      throw new ApiError(
        "Actualisez l’analyse pour confirmer cette proposition dans une carte d’action sécurisée.",
        410,
      );
    if (input.meeting_id) {
      if (input.skill)
        throw new ApiError(
          "Une méthode ne peut pas être combinée à une analyse de réunion dédiée.",
        );
      if (input.conversation_id || input.record_id)
        throw new ApiError("Une analyse de réunion démarre dans une conversation dédiée.");
      const { data: meeting, error: meetingError } = await client
        .from("meetings")
        .select("id")
        .eq("workspace_id", workspace)
        .eq("id", input.meeting_id)
        .maybeSingle();
      databaseError(meetingError);
      if (!meeting) throw new ApiError("Réunion inaccessible.", 404);
    }
    const selectedModel = model();
    if (!agentApiKey())
      throw new ApiError(
        "L’assistant n’est pas encore activé. Contactez votre administrateur.",
        503,
      );
    const started = Date.now();
    const selectedSkill = input.skill
      ? await loadSelectedSkill(
          client,
          workspace,
          user.id,
          role,
          input.skill,
          input.approval_mode,
          input.record_id,
        )
      : undefined;
    const previous = input.conversation_id
      ? await ownedConversation(client, workspace, user.id, input.conversation_id)
      : null;
    const pending = previous?.messages.at(-1);
    if (
      pending?.state === "pending" &&
      started - Date.parse(pending.created_at || previous!.updated_at) < 120000
    )
      throw new ApiError("Une réponse est déjà en cours dans cette conversation.", 409);
    if ((previous?.messages.length ?? 0) >= 40)
      throw new ApiError(
        "Cette conversation a atteint 20 échanges. Ouvrez une nouvelle conversation.",
        400,
      );
    const oldMessages = (previous?.messages ?? []).map((m) =>
      m.state === "pending"
        ? { ...m, state: "stopped" as const, answer: "Cette réponse a été interrompue." }
        : m,
    );
    const userMessage: AssistantMessage = {
      id: randomUUID(),
      role: "user",
      content: input.message,
      request_id: input.request_id ?? randomUUID(),
      created_at: new Date().toISOString(),
      record_id: input.record_id ?? null,
      approval_mode: input.approval_mode,
      ...(selectedSkill ? { skill: selectedSkill.reference } : {}),
    };
    const assistantMessage: AssistantMessage = {
      id: randomUUID(),
      role: "assistant",
      state: "pending",
      created_at: new Date().toISOString(),
      record_id: input.record_id ?? null,
    };
    const claimedMessages = [...oldMessages, userMessage, assistantMessage];
    const values = {
      messages: claimedMessages,
      updated_at: new Date(
        Math.max(Date.now(), previous ? Date.parse(previous.updated_at) + 1 : 0),
      ).toISOString(),
    };
    const claimed = previous
      ? await client
          .from("ai_conversations")
          .update(values)
          .eq("id", previous.id)
          .eq("workspace_id", workspace)
          .eq("user_id", user.id)
          .eq("updated_at", previous.updated_at)
          .select("id,title,updated_at")
          .maybeSingle()
      : await client
          .from("ai_conversations")
          .insert({
            ...values,
            workspace_id: workspace,
            user_id: user.id,
            title: input.message.slice(0, 100),
          })
          .select("id,title,updated_at")
          .single();
    databaseError(claimed.error);
    if (!claimed.data)
      throw new ApiError("La conversation a changé. Rouvrez-la avant de continuer.", 409);
    const conversation = claimed.data;
    const abort = new AbortController();
    const signal = AbortSignal.any([req.signal, abort.signal, AbortSignal.timeout(70000)]);
    const steps: AssistantStep[] = [];
    let currentStep = "";
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let runHandle: { id: string; secret: string } | undefined;
        let skillRun: { id: string; skill_id: string } | null = null;
        let connected = true;
        const emit = (event: AssistantEvent) => {
          if (!connected) return;
          try {
            controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          } catch {
            connected = false;
            abort.abort();
          }
        };
        const step = (
          id: string,
          label: string,
          status: AssistantStep["status"],
          detail?: string,
        ) => {
          currentStep = id;
          const data = { id, label, status, detail, elapsed_ms: Date.now() - started };
          const index = steps.findIndex((s) => s.id === id);
          if (index < 0) steps.push(data);
          else steps[index] = data;
          emit({ type: "step", step: data });
        };
        const persist = async (message: AssistantMessage) => {
          const result = await client
            .from("ai_conversations")
            .update({
              messages: [...oldMessages, userMessage, message],
              updated_at: new Date().toISOString(),
            })
            .eq("workspace_id", workspace)
            .eq("user_id", user.id)
            .eq("id", conversation.id)
            .eq("updated_at", conversation.updated_at)
            .select("id")
            .maybeSingle();
          databaseError(result.error);
          if (!result.data)
            throw new ApiError("La conversation a changé pendant la réponse. Rouvrez-la.", 409);
        };
        emit({
          type: "conversation",
          id: conversation.id,
          title: conversation.title,
          user: userMessage,
          message_id: assistantMessage.id,
        });
        step(
          "access",
          "Vérification des accès",
          "done",
          "Vos droits sur cet espace sont appliqués.",
        );
        try {
          signal.throwIfAborted();
          const limits = {
            toolLimit: selectedSkill
              ? Math.max(1, selectedSkill.manifest.budget.tool_calls)
              : input.deepen
                ? 15
                : 5,
            reservedTokens: input.deepen ? 1000000 : 300000,
            outputTokens: Math.min(
              3000,
              Math.max(
                500,
                Number(process.env.AGENT_OUTPUT_TOKENS) ||
                  selectedSkill?.manifest.budget.output_tokens ||
                  1600,
              ),
            ),
          };
          const runSecret = randomBytes(32).toString("hex");
          const admitted = await rpc(client, "agent_runtime", {
            w: workspace,
            operation: "begin",
            payload: {
              tool_limit: limits.toolLimit,
              reserved_tokens: input.deepen ? 180000 : 60000,
              token_limit: limits.reservedTokens,
              secret: runSecret,
            },
          });
          runHandle = { id: admitted.id, secret: runSecret };
          await rpc(client, "agent_register_request", {
            w: workspace,
            run_id: admitted.id,
            run_secret: runSecret,
            original_request: input.message,
          });
          if (selectedSkill && "id" in selectedSkill.reference) {
            skillRun = await skillEngine(workspace, user.id, "begin", {
              id: selectedSkill.reference.id,
              version_id: selectedSkill.reference.version_id,
              engine_run_id: admitted.id,
              secret: runSecret,
              request_id: userMessage.request_id,
              conversation_id: conversation.id,
              inputs: selectedSkill.inputs,
              selection: "explicit",
            });
          }
          if (selectedSkill)
            step(
              "skill",
              `Méthode chargée · ${selectedSkill.manifest.name}`,
              "done",
              "Version et autorisations vérifiées pour cette demande.",
            );
          const data = await runAgent(
            {
              client,
              workspace,
              user: user.id,
              conversation: conversation.id,
              run: admitted.id,
              runSecret,
              question: input.message,
              approvalMode: input.approval_mode,
              analysisMeetingId: input.meeting_id,
              untrustedContext:
                oldMessages.length > 0 || !!selectedSkill?.contextData.sources.length,
              requestKey: userMessage.request_id!,
              actionSequence: new Map(),
              sources: new Map(
                selectedSkill?.contextData.sources.map((source) => [source.id, source] as const),
              ),
              actions: new Map(),
              allowedTools: selectedSkill?.allowed_tools,
              ...(skillRun ? { skillRun: { id: skillRun.id, skillId: skillRun.skill_id } } : {}),
            },
            {
              ...limits,
              signal,
              model: selectedModel,
              record: input.record_id,
              // Prior model answers are never reused as evidence or authorization.
              priorQuestions: oldMessages
                .filter((m) => m.role === "user")
                .slice(-5)
                .map((m) => m.content || ""),
              step,
              emit,
              skill: selectedSkill
                ? {
                    manifest: selectedSkill.manifest,
                    inputs: selectedSkill.inputs,
                    bindings: selectedSkill.contextData.bindings,
                    bindingSources: selectedSkill.contextData.sources.map(
                      ({ id, type, label }) => ({ id, type, label }),
                    ),
                  }
                : undefined,
            },
          );
          step("save", "Enregistrement de la conversation", "running");
          const final: AssistantMessage = {
            ...assistantMessage,
            ...data,
            state: "complete",
            model: selectedModel,
            elapsed_ms: Date.now() - started,
            ...(selectedSkill ? { skill: selectedSkill.reference } : {}),
            ...(skillRun ? { skill_run_id: skillRun.id } : {}),
          };
          const saveStep: AssistantStep = {
            id: "save",
            label: "Conversation enregistrée",
            status: "done",
            elapsed_ms: Date.now() - started,
          };
          final.steps = [...steps.filter((s) => s.id !== "save"), saveStep];
          if (selectedSkill && skillRun && runHandle) {
            const dataRecord = data as typeof data & {
              partial?: boolean;
              actions?: Array<{ status?: string }>;
            };
            const terminal = dataRecord.partial
              ? "partial"
              : dataRecord.actions?.some((action) =>
                    ["pending", "draft", "confirmation_required"].includes(action.status ?? ""),
                  )
                ? "waiting_approval"
                : "completed";
            await skillEngine(workspace, user.id, "finish", {
              engine_run_id: runHandle.id,
              secret: runHandle.secret,
              run_id: skillRun.id,
              status: terminal,
            });
          }
          await persist(final);
          step("save", "Conversation enregistrée", "done");
          emit({ type: "text", text: final.answer || "" });
          emit({ type: "complete", message: final });
        } catch (error) {
          const normalizedError = skillError(error);
          const stopped = req.signal.aborted || abort.signal.aborted;
          const message = stopped
            ? "Réponse arrêtée. Vous pouvez relancer la question."
            : normalizedError instanceof ApiError
              ? normalizedError.message
              : "La réponse a été interrompue. Réessayez.";
          const details = normalizedError as {
            code?: string;
            retryAfter?: number;
            status?: number;
          };
          const retry = details.retryAfter
            ? ` Réessayez dans ${details.retryAfter} seconde(s).`
            : "";
          step(
            currentStep || "analysis",
            stopped ? "Réponse arrêtée" : "Étape interrompue",
            "error",
            message,
          );
          if (!stopped) Sentry.captureException(new Error("assistant_generation_failed"));
          try {
            await persist({
              ...assistantMessage,
              state: stopped ? "stopped" : "error",
              answer: message + retry,
              error_code: details.code,
              retry_after: details.retryAfter,
              proposals: [],
              sources: [],
              steps,
              elapsed_ms: Date.now() - started,
            });
          } catch {
            /* A newer conversation or deletion must not be overwritten. */
          }
          if (selectedSkill && skillRun && runHandle) {
            await skillEngine(workspace, user.id, "finish", {
              engine_run_id: runHandle.id,
              secret: runHandle.secret,
              run_id: skillRun.id,
              status: stopped ? "cancelled" : "failed",
            }).catch(() => {});
          }
          emit({
            type: "error",
            error: message + retry,
            status: details.status,
            code: details.code,
            retry_after: details.retryAfter,
          });
        } finally {
          // Covers registration failures before runAgent starts. Terminal ledger
          // settlement is idempotent, so the runner's own finish can safely win.
          if (runHandle)
            await rpc(client, "agent_runtime", {
              w: workspace,
              operation: "finish",
              payload: { id: runHandle.id, secret: runHandle.secret, status: "error" },
            }).catch(() => {});
          try {
            controller.close();
          } catch {
            /* Client disconnected. */
          }
        }
      },
      cancel() {
        abort.abort();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "private, no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return fail(skillError(e));
  }
}
