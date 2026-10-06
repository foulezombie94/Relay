import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { connection, externalJson } from "./oauth";
import { workerClient } from "./worker-client";
import { deliver } from "./delivery";
import { unseal } from "./crypto";
import {
  sequenceSteps,
  sequenceMessage,
  businessTime,
  nextSequenceDate,
} from "@/lib/domain/sequences";
import { ApiError, databaseError } from "@/lib/api/context";
export async function processSequence(admin: SupabaseClient) {
  const { data: job, error } = await admin.rpc("sequence_job", {
    operation: "claim",
  });
  databaseError(error);
  if (!job) return false;
  const lease = { delivery_id: job.delivery_id, lease: job.lease };
  let attempted = false;
  try {
    const steps = sequenceSteps.parse(job.steps);
    const step = steps[job.step];
    if (!step) throw new Error("Étape indisponible");
    const now = new Date();
    const eligible = businessTime(now, job.timezone);
    if (eligible.getTime() > now.getTime()) {
      const r = await admin.rpc("sequence_job", {
        operation: "defer",
        payload: { ...lease, next_at: eligible.toISOString() },
      });
      databaseError(r.error);
      return true;
    }
    const origin = new URL(process.env.APP_URL ?? "");
    if (origin.protocol !== "https:")
      throw new Error(
        "Un domaine HTTPS public est nécessaire pour les séquences",
      );
    const client = workerClient(
      admin,
      job.workspace_id,
      job.user_id,
      job.provider,
    );
    const { tokens } = await connection(client, job.workspace_id, job.provider);
    let reply = false;
    if (job.provider === "gmail") {
      const q = new URLSearchParams({
        maxResults: "1",
        q:
          "from:(" +
          job.email +
          ") after:" +
          Math.floor(Date.parse(job.since) / 1000),
      });
      const r = await externalJson(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages?" + q,
        tokens.access_token,
      );
      reply = (r.messages ?? []).length > 0;
    } else {
      const q = new URLSearchParams({
        $top: "1",
        $select: "id",
        $filter:
          "receivedDateTime ge " +
          new Date(job.since).toISOString() +
          " and from/emailAddress/address eq '" +
          String(job.email).replace(/'/g, "''") +
          "'",
      });
      const r = await externalJson(
        "https://graph.microsoft.com/v1.0/me/messages?" + q,
        tokens.access_token,
      );
      reply = (r.value ?? []).length > 0;
    }
    if (reply) {
      const r = await admin.rpc("sequence_job", {
        operation: "reply",
        payload: lease,
      });
      databaseError(r.error);
      return true;
    }
    const message = sequenceMessage(step, job.record);
    const token = unseal<{ token: string }>(job.unsubscribe_cipher).token;
    const link = new URL("/unsubscribe", origin);
    link.searchParams.set("id", job.id);
    link.searchParams.set("token", token);
    const body =
      message.body + "\n\nNe plus recevoir ces suivis : " + link.toString();
    const prepared = await admin.rpc("sequence_job", {
      operation: "prepare",
      payload: lease,
    });
    databaseError(prepared.error);
    if (!prepared.data?.ok) return true;
    attempted = true;
    const providerId = await deliver(
      job.provider,
      tokens.access_token,
      { to: job.email, subject: message.subject, body },
      job.delivery_id + "@" + origin.hostname,
    );
    const next = steps[job.step + 1];
    const complete = await admin.rpc("sequence_job", {
      operation: "complete",
      payload: {
        ...lease,
        provider_id: providerId,
        next_at: next
          ? nextSequenceDate(next.delay_days, job.timezone).toISOString()
          : null,
      },
    });
    databaseError(complete.error);
    return true;
  } catch (error) {
    const message = attempted
      ? "Envoi incertain : vérifiez la boîte d’envoi. Ce message ne sera pas renvoyé automatiquement."
      : error instanceof ApiError
        ? error.message
        : "Le suivi a été arrêté avant l’envoi. Vérifiez le contenu, le fuseau horaire et le compte connecté.";
    await admin.rpc("sequence_job", {
      operation: "fail",
      payload: { ...lease, error: message },
    });
    return true;
  }
}
