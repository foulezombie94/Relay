import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { connection, externalJson } from "./oauth";
import { services, type Service } from "./services";
import { databaseError } from "@/lib/api/context";
type Item = {
  provider_id: string;
  kind: "email" | "calendar";
  subject: string;
  sender: string;
  recipients: string[];
  body: string;
  starts_at?: string | null;
  received_at?: string | null;
};
const text = (v: unknown, max = 30000) =>
  typeof v === "string" ? v.slice(0, max) : "";
export async function synchronize(
  client: SupabaseClient,
  w: string,
  user: string,
  p: Service,
) {
  const { id, tokens } = await connection(client, w, p);
  const token = tokens.access_token;
  const service = services[p];
  const items: Item[] = [];
  if (service.family === "google" && service.kind === "email") {
    const list = await externalJson(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25",
      token,
    );
    const messages = (list.messages ?? []).slice(0, 25);
    for (let i = 0; i < messages.length; i += 5) {
      const batch = await Promise.all(
        messages.slice(i, i + 5).map(async (message: { id: string }) => {
          const m = await externalJson(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/" +
              encodeURIComponent(message.id) +
              "?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To",
            token,
          );
          const header = (key: string) =>
            text(
              m.payload?.headers?.find(
                (h: { name: string }) =>
                  h.name.toLowerCase() === key.toLowerCase(),
              )?.value,
              1000,
            );
          return {
            provider_id: text(m.id, 1000),
            kind: "email" as const,
            subject: header("Subject"),
            sender: header("From"),
            recipients: [header("To")],
            body: text(m.snippet),
            received_at: new Date(Number(m.internalDate)).toISOString(),
          };
        }),
      );
      items.push(...batch);
    }
  } else if (service.family === "google") {
    const query = new URLSearchParams({
      timeMin: new Date().toISOString(),
      timeMax: new Date(Date.now() + 30 * 86400000).toISOString(),
      maxResults: "25",
      singleEvents: "true",
      orderBy: "startTime",
    });
    const events = await externalJson(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?" +
        query,
      token,
    );
    for (const e of (events.items ?? []).slice(0, 25)) {
      if (e.status === "cancelled") continue;
      items.push({
        provider_id: text(e.id, 1000),
        kind: "calendar",
        subject: text(e.summary || "Événement", 1000),
        sender: text(e.organizer?.email, 1000),
        recipients: (e.attendees ?? []).map((a: { email: string }) =>
          text(a.email, 1000),
        ),
        body: text(e.description),
        starts_at:
          e.start?.dateTime ||
          (e.start?.date ? e.start.date + "T00:00:00Z" : null),
        received_at: e.updated || null,
      });
    }
  } else if (service.kind === "email") {
    const list = await externalJson(
      "https://graph.microsoft.com/v1.0/me/messages?$top=25&$select=id,subject,from,toRecipients,bodyPreview,receivedDateTime&$orderby=receivedDateTime%20desc",
      token,
      { headers: { Prefer: 'IdType="ImmutableId"' } },
    );
    for (const m of (list.value ?? []).slice(0, 25))
      items.push({
        provider_id: text(m.id, 1000),
        kind: "email",
        subject: text(m.subject, 1000),
        sender: text(m.from?.emailAddress?.address, 1000),
        recipients: (m.toRecipients ?? []).map(
          (a: { emailAddress: { address: string } }) =>
            text(a.emailAddress?.address, 1000),
        ),
        body: text(m.bodyPreview),
        received_at: m.receivedDateTime || null,
      });
  } else {
    const query = new URLSearchParams({
      startDateTime: new Date().toISOString(),
      endDateTime: new Date(Date.now() + 30 * 86400000).toISOString(),
      $top: "25",
      $orderby: "start/dateTime",
    });
    const events = await externalJson(
      "https://graph.microsoft.com/v1.0/me/calendarView?" + query,
      token,
      { headers: { Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"' } },
    );
    for (const e of (events.value ?? []).slice(0, 25)) {
      if (e.isCancelled) continue;
      const start = e.start?.dateTime;
      items.push({
        provider_id: text(e.id, 1000),
        kind: "calendar",
        subject: text(e.subject, 1000),
        sender: text(e.organizer?.emailAddress?.address, 1000),
        recipients: (e.attendees ?? []).map(
          (a: { emailAddress: { address: string } }) =>
            text(a.emailAddress?.address, 1000),
        ),
        body: text(e.bodyPreview),
        starts_at: start
          ? /[Zz]$|[+-]\d{2}:\d{2}$/.test(start)
            ? start
            : start + "Z"
          : null,
        received_at: e.lastModifiedDateTime || null,
      });
    }
  }
  if (items.length) {
    const { error } = await client.from("communications").upsert(
      items.map((i) => ({
        ...i,
        workspace_id: w,
        user_id: user,
        integration_id: id,
      })),
      { onConflict: "integration_id,kind,provider_id" },
    );
    databaseError(error);
  }
  const { error } = await client.rpc("integration_touch", { w, p });
  databaseError(error);
  return { synced: items.length, limit: 25, kind: service.kind };
}
