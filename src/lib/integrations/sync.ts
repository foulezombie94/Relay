import "server-only";
import { gmailContent } from "./email-content";
import type { SupabaseClient } from "@supabase/supabase-js";
import { connection, externalJson } from "./oauth";
import { services, type Service } from "./services";
import { ApiError, databaseError } from "@/lib/api/context";
import { syncWindow, graphPage } from "./sync-window";
import { meetingBatch } from "./meetings";
import { meetingUrl } from "@/lib/domain/meetings";
type Item = {
  provider_id: string;
  kind: "email" | "calendar";
  subject: string;
  sender: string;
  recipients: string[];
  body: string;
  content_complete?: boolean;
  internet_message_id?: string;
  attachments?: unknown[];
  is_reply?: boolean;
  thread_id?: string;
  sender_email?: string;
  direction?: "inbound" | "outbound";
  ends_at?: string | null;
  starts_at?: string | null;
  received_at?: string | null;
  join_url?: string;
  location?: string;
};
const text = (v: unknown, max = 30000) => (typeof v === "string" ? v.slice(0, max) : "");
export async function synchronize(client: SupabaseClient, w: string, user: string, p: Service) {
  const { data: claim, error: claimError } = await client.rpc("connector_sync", {
    w,
    p,
    operation: "claim",
  });
  if (claimError)
    throw new ApiError(
      claimError.code === "40001"
        ? "Une synchronisation est déjà en cours."
        : "Impossible de démarrer la synchronisation.",
      409,
    );
  const lease = claim.lease;
  let leaseLost = false;
  let renewing: Promise<unknown> | undefined;
  const renewal = setInterval(() => {
    if (!renewing)
      renewing = Promise.resolve(
        client.rpc("connector_sync", { w, p, operation: "renew", payload: { lease } }),
      )
        .then(({ error }) => {
          if (error) leaseLost = true;
        })
        .catch(() => {
          leaseLost = true;
        })
        .finally(() => {
          renewing = undefined;
        });
  }, 45000);
  try {
    const { tokens } = await connection(client, w, p);
    const token = tokens.access_token;
    if (p === "google-meet" || p === "microsoft-teams" || p === "zoom") {
      const batch = await meetingBatch(p, token, tokens.email, claim.cursor);
      if (leaseLost) throw new ApiError("Le verrou de synchronisation a expiré.", 409);
      const result = await client.rpc("meeting_sync_finish", {
        w,
        p,
        payload: { ...batch, lease },
      });
      databaseError(result.error);
      return { ...result.data, kind: "meeting" };
    }
    const service = services[p];
    const window = syncWindow(claim.cursor, service.kind);
    const items: Item[] = [];
    let page: string | undefined;
    if (service.family === "google" && service.kind === "email") {
      const query = new URLSearchParams({
        maxResults: "100",
        q:
          "after:" +
          Math.floor(Date.parse(window.start) / 1000) +
          " before:" +
          Math.ceil(Date.parse(window.end) / 1000),
      });
      if (window.page) query.set("pageToken", window.page);
      const list = await externalJson(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages?" + query,
        token,
      );
      page = list.nextPageToken;
      const messages = (list.messages ?? []).slice(0, 100);
      for (let i = 0; i < messages.length; i += 5) {
        items.push(
          ...(await Promise.all(
            messages.slice(i, i + 5).map(async (message: { id: string }) => {
              const m = await externalJson(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/" +
                  encodeURIComponent(message.id) +
                  "?format=full",
                token,
              );
              const header = (name: string) =>
                text(
                  m.payload?.headers?.find(
                    (h: { name: string }) => h.name.toLowerCase() === name.toLowerCase(),
                  )?.value,
                  1000,
                );
              return {
                provider_id: text(m.id, 1000),
                kind: "email" as const,
                subject: header("Subject"),
                sender: header("From"),
                sender_email: (
                  header("From").match(/<([^>]+)>/)?.[1] ?? header("From")
                ).toLowerCase(),
                thread_id: text(m.threadId, 1000),
                is_reply: !!header("In-Reply-To"),
                direction: m.labelIds?.includes("SENT")
                  ? ("outbound" as const)
                  : ("inbound" as const),
                recipients: header("To")
                  .split(",")
                  .map((v) => (v.match(/<([^>]+)>/)?.[1] ?? v.trim()).toLowerCase()),
                ...gmailContent(m.payload ?? {}),
                internet_message_id: header("Message-ID"),
                received_at: new Date(Number(m.internalDate)).toISOString(),
              };
            }),
          )),
        );
      }
    } else if (service.family === "google") {
      const query = new URLSearchParams({
        timeMin: window.start,
        timeMax: window.end,
        maxResults: "100",
        singleEvents: "true",
        orderBy: "startTime",
      });
      if (window.page) query.set("pageToken", window.page);
      const events = await externalJson(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?" + query,
        token,
      );
      page = events.nextPageToken;
      for (const e of (events.items ?? []).slice(0, 100)) {
        if (e.status === "cancelled") continue;
        items.push({
          provider_id: text(e.id, 1000),
          kind: "calendar",
          subject: text(e.summary || "Événement", 1000),
          sender: text(e.organizer?.email, 1000),
          recipients: (e.attendees ?? []).map((a: { email: string }) => text(a.email, 1000)),
          body: text(e.description),
          join_url:
            meetingUrl(
              text(
                e.hangoutLink ||
                  e.conferenceData?.entryPoints?.find(
                    (point: { entryPointType: string }) => point.entryPointType === "video",
                  )?.uri,
                2048,
              ),
            ) ?? "",
          location: text(e.location, 300),
          starts_at: e.start?.dateTime || (e.start?.date ? e.start.date + "T00:00:00Z" : null),
          ends_at: e.end?.dateTime ?? (e.end?.date ? e.end.date + "T00:00:00Z" : null),
          received_at: e.updated || null,
        });
      }
    } else if (service.kind === "email") {
      const query = new URLSearchParams({
        $top: "100",
        $select:
          "id,subject,from,toRecipients,body,receivedDateTime,conversationId,internetMessageHeaders,internetMessageId",
        $orderby: "receivedDateTime desc",
        $filter: "receivedDateTime ge " + window.start + " and receivedDateTime lt " + window.end,
      });
      const list = await externalJson(
        window.page
          ? graphPage(window.page, "messages")
          : "https://graph.microsoft.com/v1.0/me/messages?" + query,
        token,
        { headers: { Prefer: 'outlook.body-content-type="text", IdType="ImmutableId"' } },
      );
      page = list["@odata.nextLink"];
      for (const m of (list.value ?? []).slice(0, 100))
        items.push({
          provider_id: text(m.id, 1000),
          kind: "email",
          subject: text(m.subject, 1000),
          sender: text(m.from?.emailAddress?.address, 1000),
          sender_email: text(m.from?.emailAddress?.address, 1000).toLowerCase(),
          thread_id: text(m.conversationId, 1000),
          is_reply: !!m.internetMessageHeaders?.some(
            (h: { name: string }) => h.name.toLowerCase() === "in-reply-to",
          ),
          recipients: (m.toRecipients ?? []).map((a: { emailAddress: { address: string } }) =>
            text(a.emailAddress?.address, 1000),
          ),
          body: text(m.body?.content),
          content_complete: String(m.body?.content ?? "").length <= 30000,
          internet_message_id: text(m.internetMessageId, 1000),
          received_at: m.receivedDateTime || null,
        });
    } else {
      const query = new URLSearchParams({
        startDateTime: window.start,
        endDateTime: window.end,
        $top: "100",
        $orderby: "start/dateTime",
      });
      const events = await externalJson(
        window.page
          ? graphPage(window.page, "calendarView")
          : "https://graph.microsoft.com/v1.0/me/calendarView?" + query,
        token,
        { headers: { Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"' } },
      );
      page = events["@odata.nextLink"];
      for (const e of (events.value ?? []).slice(0, 100)) {
        if (e.isCancelled) continue;
        const start = e.start?.dateTime;
        items.push({
          provider_id: text(e.id, 1000),
          kind: "calendar",
          subject: text(e.subject, 1000),
          sender: text(e.organizer?.emailAddress?.address, 1000),
          recipients: (e.attendees ?? []).map((a: { emailAddress: { address: string } }) =>
            text(a.emailAddress?.address, 1000),
          ),
          body: text(e.bodyPreview),
          join_url: meetingUrl(text(e.onlineMeeting?.joinUrl, 2048)) ?? "",
          location: text(e.location?.displayName, 300),
          starts_at: start ? (/[Zz]$|[+-]\d{2}:\d{2}$/.test(start) ? start : start + "Z") : null,
          ends_at: e.end?.dateTime
            ? /[Zz]$|[+-]\d{2}:\d{2}$/.test(e.end.dateTime)
              ? e.end.dateTime
              : e.end.dateTime + "Z"
            : null,
          received_at: e.lastModifiedDateTime || null,
        });
      }
    }
    if (page && typeof page !== "string")
      throw new ApiError("Réponse de pagination fournisseur invalide.", 502);
    const complete = !page;
    const cursor = page
      ? { ...window, page }
      : { watermark: service.kind === "email" ? window.end : undefined };
    if (leaseLost)
      throw new ApiError(
        "Le verrou de synchronisation a expiré. Réessayez pour reprendre ce lot.",
        409,
      );
    const { data, error } = await client.rpc("connector_sync", {
      w,
      p,
      operation: "finish",
      payload: {
        lease,
        items,
        cursor,
        complete,
        window_start: window.start,
        window_end: window.end,
      },
    });
    databaseError(error);
    return { ...data, kind: service.kind };
  } catch (error) {
    await client.rpc("connector_sync", {
      w,
      p,
      operation: "fail",
      payload: {
        lease,
        error:
          error instanceof ApiError
            ? error.message
            : "Synchronisation interrompue. Relancez pour reprendre le même lot.",
      },
    });
    throw error;
  } finally {
    clearInterval(renewal);
    await renewing;
  }
}
