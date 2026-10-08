import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { actionSchemas, type AgentAction } from "@/lib/agent/contracts";
import { connection } from "@/lib/integrations/oauth";
import { workerClient } from "@/lib/integrations/worker-client";
import { hasCalendarWriteScope } from "@/lib/integrations/services";
import type { Job, JobResult } from "../types";

class Rejected extends Error {}
async function request(url: string, token: string, body: unknown, method = "POST") {
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Prefer: 'IdType="ImmutableId", outlook.body-content-type="text"',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if ([400, 401, 403, 404, 422, 429].includes(r.status)) throw new Rejected("provider_rejected");
  if (!r.ok) throw new Error("provider_uncertain");
  if ([202, 204].includes(r.status)) return {} as Record<string, unknown>;
  if (!r.body) throw new Error("provider_empty_response");
  const reader = r.body.getReader(),
    decoder = new TextDecoder();
  let text = "";
  try {
    while (true) {
      const part = await reader.read();
      text += decoder.decode(part.value, { stream: !part.done });
      if (text.length > 100000) throw new Error("provider_response_too_large");
      if (part.done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return JSON.parse(text) as Record<string, unknown>;
}
export async function agentJob(admin: SupabaseClient, job: Job): Promise<JobResult> {
  const lease = { job_id: job.id, lease: job.lease };
  const operation = async (op: string, payload: Record<string, unknown> = {}) => {
    const r = await admin.rpc("agent_effect_worker", {
      operation: op,
      payload: { ...lease, ...payload },
    });
    if (r.error) throw Object.assign(new Error("agent_effect_failed"), { code: r.error.code });
    return r.data;
  };
  const action = (await operation("load")) as AgentAction & {
    workspace_id: string;
    user_id: string;
  };
  if (action.status !== "queued")
    return { result: { action_id: action.id, status: action.status } };
  let attempted = false;
  try {
    if (
      ![
        "draft_email",
        "create_calendar_event",
        "update_calendar_event",
        "cancel_calendar_event",
      ].includes(action.kind)
    )
      throw new Rejected("invalid_action");
    const parsed = actionSchemas[action.kind].parse(action.input) as Record<string, unknown>;
    // Determine account from the authorized original calendar source, never a URL
    // or OAuth token supplied by the model. All provider URLs are fixed hosts.
    let provider = String(parsed.provider ?? "");
    if (["cancel_calendar_event", "update_calendar_event"].includes(action.kind)) {
      const r = await admin
        .from("communications")
        .select("integration_id,integrations(provider)")
        .eq("workspace_id", action.workspace_id)
        .eq("user_id", action.user_id)
        .eq("kind", "calendar")
        .eq("id", parsed.id)
        .maybeSingle();
      if (r.error || !r.data) throw new Rejected("event_revoked");
      const i = await admin
        .from("integrations")
        .select("provider")
        .eq("workspace_id", action.workspace_id)
        .eq("id", r.data.integration_id)
        .eq("user_id", action.user_id)
        .eq("status", "connected")
        .maybeSingle();
      if (i.error || !i.data) throw new Rejected("account_revoked");
      provider = i.data.provider;
    }
    const service = z
      .enum(["gmail", "outlook", "google-calendar", "outlook-calendar"])
      .parse(provider);
    const { tokens } = await connection(
      workerClient(admin, action.workspace_id, action.user_id, service),
      action.workspace_id,
      service,
    );
    if (action.kind !== "draft_email" && !hasCalendarWriteScope(service, tokens.scope))
      throw new Rejected("calendar_write_permission");
    const prepared = await operation("prepare");
    attempted = true;
    let result: Record<string, unknown> = {};
    let state = "completed";
    if (action.kind === "draft_email") {
      const data = actionSchemas.draft_email.parse(parsed);
      if (service === "gmail") {
        const reply = prepared.internet_message_id;
        if (reply && /[\r\n]/.test(reply)) throw new Rejected("invalid_reply_header");
        const mime = `To: ${data.to}\r\nSubject: =?UTF-8?B?${Buffer.from(data.subject).toString("base64")}?=\r\nMessage-ID: <${action.id}@relay-agent.invalid>\r\n${reply ? `In-Reply-To: ${reply}\r\nReferences: ${reply}\r\n` : ""}MIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(data.body).toString("base64")}`;
        const sent = await request(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
          tokens.access_token,
          {
            raw: Buffer.from(mime).toString("base64url"),
            ...(prepared.thread_id ? { threadId: prepared.thread_id } : {}),
          },
        );
        if (typeof sent.id !== "string" || !sent.id) throw new Error("missing_confirmation");
        result = { provider_id: sent.id };
        state = "sent";
      } else {
        // Graph sendMail's 202 only acknowledges acceptance. Create a draft with
        // an immutable ID, send once, then verify sentDateTime before claiming sent.
        const draft = data.reply_to_id
          ? await request(
              "https://graph.microsoft.com/v1.0/me/messages/" +
                encodeURIComponent(prepared.provider_id) +
                "/createReply",
              tokens.access_token,
              { message: { body: { contentType: "Text", content: data.body } } },
            )
          : await request("https://graph.microsoft.com/v1.0/me/messages", tokens.access_token, {
              subject: data.subject,
              body: { contentType: "Text", content: data.body },
              toRecipients: [{ emailAddress: { address: data.to } }],
              internetMessageHeaders: [{ name: "x-relay-action-id", value: action.id }],
            });
        if (typeof draft.id !== "string") throw new Error("missing_draft_id");
        // Graph createReply may inherit Reply-To and copied recipients. Always
        // replace the complete destination and content with the approved artifact.
        if (data.reply_to_id)
          await request(
            "https://graph.microsoft.com/v1.0/me/messages/" + encodeURIComponent(draft.id),
            tokens.access_token,
            {
              subject: data.subject,
              body: { contentType: "Text", content: data.body },
              toRecipients: [{ emailAddress: { address: data.to } }],
              ccRecipients: [],
              bccRecipients: [],
            },
            "PATCH",
          );
        const exact = await request(
          "https://graph.microsoft.com/v1.0/me/messages/" +
            encodeURIComponent(draft.id) +
            "?$select=subject,toRecipients,ccRecipients,bccRecipients,body",
          tokens.access_token,
          undefined,
          "GET",
        );
        const recipient = z
          .array(z.object({ emailAddress: z.object({ address: z.string() }) }))
          .parse(exact.toRecipients);
        const exactBody = z
          .object({ contentType: z.string(), content: z.string() })
          .parse(exact.body);
        if (
          exact.subject !== data.subject ||
          recipient.length !== 1 ||
          recipient[0].emailAddress.address.toLowerCase() !== data.to ||
          !Array.isArray(exact.ccRecipients) ||
          exact.ccRecipients.length ||
          !Array.isArray(exact.bccRecipients) ||
          exact.bccRecipients.length ||
          exactBody.contentType.toLowerCase() !== "text" ||
          exactBody.content.replace(/\r\n/g, "\n") !== data.body.replace(/\r\n/g, "\n")
        )
          throw new Rejected("reply_scope_mismatch");
        try {
          await operation("verify_dispatch");
        } catch (error) {
          if (["42501", "40001"].includes((error as { code?: string }).code ?? ""))
            throw new Rejected("authorization_revoked_before_send");
          throw error;
        }
        await request(
          "https://graph.microsoft.com/v1.0/me/messages/" + encodeURIComponent(draft.id) + "/send",
          tokens.access_token,
          {},
        );
        const sent = await request(
          "https://graph.microsoft.com/v1.0/me/messages/" +
            encodeURIComponent(draft.id) +
            "?$select=id,isDraft,sentDateTime",
          tokens.access_token,
          undefined,
          "GET",
        ).catch(() => {
          throw new Error("sent_confirmation_unavailable");
        });
        result = { provider_id: draft.id, provider_accepted: true };
        state =
          sent.isDraft === false && typeof sent.sentDateTime === "string" ? "sent" : "uncertain";
      }
    } else {
      const google = service === "google-calendar";
      const base = google
        ? "https://www.googleapis.com/calendar/v3/calendars/primary/events"
        : "https://graph.microsoft.com/v1.0/me/events";
      const update = action.kind === "update_calendar_event",
        cancel = action.kind === "cancel_calendar_event";
      const url = update || cancel ? base + "/" + encodeURIComponent(prepared.provider_id) : base;
      const body = cancel
        ? undefined
        : google
          ? {
              ...(update ? {} : { id: action.id.replaceAll("-", "") }),
              summary: parsed.title,
              description: parsed.body,
              start: { dateTime: parsed.starts_at },
              end: { dateTime: parsed.ends_at },
            }
          : {
              ...(update ? {} : { transactionId: action.id }),
              subject: parsed.title,
              body: { contentType: "Text", content: parsed.body },
              start: { dateTime: parsed.starts_at, timeZone: "UTC" },
              end: { dateTime: parsed.ends_at, timeZone: "UTC" },
            };
      const sent = await request(
        url,
        tokens.access_token,
        body,
        cancel ? "DELETE" : update ? "PATCH" : "POST",
      );
      result = { provider_id: cancel ? prepared.provider_id : sent.id };
      if (!result.provider_id) throw new Error("missing_confirmation");
    }
    await operation("finish", {
      state,
      result,
      ...(state === "uncertain" ? { code: "provider_accepted_unconfirmed" } : {}),
    });
    return { result: { action_id: action.id, status: state } };
  } catch (error) {
    const state = attempted && !(error instanceof Rejected) ? "uncertain" : "failed";
    await operation("finish", {
      state,
      code:
        state === "uncertain"
          ? "delivery_uncertain"
          : error instanceof Rejected
            ? error.message
            : "action_unavailable",
    });
    // A committed failed/uncertain effect completes the queue job. No blind retry.
    return { result: { action_id: action.id, status: state } };
  }
}
