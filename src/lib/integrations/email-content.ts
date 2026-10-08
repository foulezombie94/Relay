import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, databaseError } from "@/lib/api/context";
import { connection, externalJson } from "./oauth";
import { z } from "zod";

type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
};
export function gmailContent(payload: GmailPart) {
  const plain: string[] = [],
    html: string[] = [],
    attachments: Array<{ name: string; size: number; mime: string; provider_id: string }> = [];
  let nodes = 0,
    bytes = 0,
    complete = true;
  const walk = (p: GmailPart, depth: number) => {
    if (++nodes > 100 || depth > 15) {
      complete = false;
      return;
    }
    if (p.filename && p.body?.attachmentId) {
      if (attachments.length < 20)
        attachments.push({
          name: p.filename.slice(0, 250),
          size: Math.max(0, Number(p.body.size) || 0),
          mime: (p.mimeType ?? "application/octet-stream").slice(0, 100),
          provider_id: p.body.attachmentId.slice(0, 1000),
        });
      else complete = false;
      return;
    }
    if (p.body?.data && ["text/plain", "text/html"].includes(p.mimeType ?? "")) {
      if (p.body.data.length > 400000 || bytes > 200000) {
        complete = false;
        return;
      }
      const text = Buffer.from(p.body.data, "base64url").toString("utf8");
      bytes += Buffer.byteLength(text);
      (p.mimeType === "text/plain" ? plain : html).push(text);
    }
    for (const child of (p.parts ?? []).slice(0, 100)) walk(child, depth + 1);
  };
  walk(payload, 0);
  const text = plain.length
    ? plain.join("\n")
    : html
        .join("\n")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
  return {
    body: text.slice(0, 30000),
    content_complete: complete && text.length <= 30000,
    attachments,
  };
}
export async function hydrateEmail(client: SupabaseClient, w: string, id: string) {
  const row = await client
    .from("communications")
    .select("id,integration_id,provider_id,kind,content_complete,user_id")
    .eq("workspace_id", w)
    .eq("id", id)
    .eq("kind", "email")
    .maybeSingle();
  databaseError(row.error);
  if (!row.data) throw new ApiError("Email inaccessible.", 403);
  const i = await client
    .from("integrations")
    .select("provider")
    .eq("workspace_id", w)
    .eq("id", row.data.integration_id)
    .eq("status", "connected")
    .maybeSingle();
  databaseError(i.error);
  if (!i.data) throw new ApiError("Reconnectez le compte pour lire le message complet.", 409);
  const p = z.enum(["gmail", "outlook"]).parse(i.data.provider);
  const { tokens } = await connection(client, w, p);
  let values: Record<string, unknown>;
  if (p === "gmail") {
    const full = await externalJson(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/" +
        encodeURIComponent(row.data.provider_id) +
        "?format=full",
      tokens.access_token,
    );
    values = {
      ...gmailContent(full.payload ?? {}),
      internet_message_id:
        full.payload?.headers
          ?.find((h: { name: string }) => h.name.toLowerCase() === "message-id")
          ?.value?.slice(0, 1000) ?? null,
    };
  } else {
    const full = await externalJson(
      "https://graph.microsoft.com/v1.0/me/messages/" +
        encodeURIComponent(row.data.provider_id) +
        "?$select=id,body,internetMessageId,hasAttachments",
      tokens.access_token,
      { headers: { Prefer: 'outlook.body-content-type="text", IdType="ImmutableId"' } },
    );
    const content = String(full.body?.content ?? "");
    let attachments: unknown[] = [];
    if (full.hasAttachments) {
      const list = await externalJson(
        "https://graph.microsoft.com/v1.0/me/messages/" +
          encodeURIComponent(row.data.provider_id) +
          "/attachments?$select=id,name,contentType,size&$top=20",
        tokens.access_token,
      );
      attachments = (list.value ?? [])
        .slice(0, 20)
        .map((a: { id: string; name: string; size: number; contentType: string }) => ({
          provider_id: a.id,
          name: String(a.name).slice(0, 250),
          size: Number(a.size) || 0,
          mime: String(a.contentType).slice(0, 100),
        }));
    }
    values = {
      body: content.slice(0, 30000),
      content_complete: content.length <= 30000,
      attachments,
      internet_message_id: String(full.internetMessageId ?? "").slice(0, 1000),
    };
  }
  const update = await client
    .from("communications")
    .update(values)
    .eq("workspace_id", w)
    .eq("id", id)
    .eq("user_id", row.data.user_id)
    .select("id")
    .maybeSingle();
  databaseError(update.error);
  if (!update.data) throw new ApiError("Le message n’est plus accessible.", 403);
  return values;
}
