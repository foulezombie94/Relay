import "server-only";
import { request } from "node:https";
import { ApiError } from "@/lib/api/context";
import { externalJson } from "./oauth";
import { graphPage, syncWindow } from "./sync-window";
import { resolveWorkflowDestination } from "./workflow-http";

type MeetingProvider = "google-meet" | "microsoft-teams" | "zoom";
type Meeting = {
  provider_id: string;
  title: string;
  starts_at: string | null;
  transcript: string;
  transcript_complete: boolean;
};
const cap = 200000;
const text = (value: unknown, limit = 1000) =>
  typeof value === "string" ? value.slice(0, limit) : "";
function resource(value: unknown, pattern: RegExp) {
  if (typeof value !== "string" || value.length > 1000 || !pattern.test(value))
    throw new ApiError("Identifiant de transcription fournisseur invalide.", 502);
  return value;
}
export function transcriptText(value: string) {
  // VTT cue identifiers/times are formatting, never instructions. Preserve the
  // spoken wording for citation checks; do not infer speakers or commitments.
  return value
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => !/^(WEBVTT|\d+\s*$|\d{2}:\d{2}(?::\d{2})?\.\d{3}\s*-->)/.test(line))
    .join("\n")
    .trim();
}
export function transcriptURL(value: string, provider: "zoom" | "microsoft-teams") {
  const url = new URL(value);
  const allowed =
    provider === "zoom"
      ? url.hostname === "zoom.us" || /^[a-z0-9-]+\.zoom\.us$/.test(url.hostname)
      : url.hostname === "graph.microsoft.com";
  if (!allowed || url.protocol !== "https:" || url.port || url.username || url.password || url.hash)
    throw new ApiError("Adresse de transcription interdite.", 400);
  return url;
}
async function download(value: string, token: string, provider: "zoom" | "microsoft-teams") {
  const url = transcriptURL(value, provider);
  const { chosen } = await resolveWorkflowDestination(url.toString());
  // Pin the public DNS address. Never follow a redirect with the OAuth token.
  return new Promise<string>((resolve, reject) => {
    const req = request(
      url,
      {
        headers: { Authorization: "Bearer " + token },
        lookup: (_host, _options, callback) => callback(null, chosen.address, chosen.family),
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(
            new ApiError("Transcription indisponible ou accès refusé par le fournisseur.", 409),
          );
          return;
        }
        let bytes = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 2000000)
            res.destroy(new ApiError("Transcription trop volumineuse ; importez un extrait.", 413));
          else chunks.push(chunk);
        });
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      },
    );
    const timer = setTimeout(
      () => req.destroy(new ApiError("Téléchargement de transcription trop long.", 504)),
      15000,
    );
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end();
  });
}

export async function meetingBatch(
  p: MeetingProvider,
  token: string,
  email: string,
  cursor: Record<string, unknown>,
) {
  // Discovery is paged across jobs; each content batch is bounded. Imported
  // coverage is explicitly reported and never presented as a complete archive.
  const window = syncWindow(cursor, "email");
  const signal = AbortSignal.timeout(65000);
  const json = (url: string, headers?: Record<string, string>) =>
    externalJson(url, token, { signal, headers });
  const items: Meeting[] = [];
  let page: string | undefined,
    partial = false;
  if (p === "google-meet") {
    const query = new URLSearchParams({
      pageSize: "1",
      filter: `start_time >= "${window.start}" AND start_time <= "${window.end}"`,
    });
    if (window.page) query.set("pageToken", window.page);
    const list = await json("https://meet.googleapis.com/v2/conferenceRecords?" + query);
    page = list.nextPageToken;
    for (const conference of (list.conferenceRecords ?? []).slice(0, 1)) {
      const name = resource(conference.name, /^conferenceRecords\/[A-Za-z0-9_-]+$/);
      const transcripts = await json(
        "https://meet.googleapis.com/v2/" + name + "/transcripts?pageSize=10",
      );
      partial ||= !!transcripts.nextPageToken;
      for (const transcript of (transcripts.transcripts ?? []).slice(0, 10)) {
        const id = resource(
          transcript.name,
          /^conferenceRecords\/[A-Za-z0-9_-]+\/transcripts\/[A-Za-z0-9_-]+$/,
        );
        let body = "",
          next: string | undefined;
        for (let n = 0; n < 10; n++) {
          const query = new URLSearchParams({ pageSize: "100" });
          if (next) query.set("pageToken", next);
          const entries = await json("https://meet.googleapis.com/v2/" + id + "/entries?" + query);
          body +=
            (body ? "\n" : "") +
            (entries.transcriptEntries ?? [])
              .slice(0, 100)
              .map((entry: { text?: unknown }) => text(entry.text, cap))
              .join("\n");
          next = entries.nextPageToken;
          if (next && (typeof next !== "string" || next.length > 8000))
            throw new ApiError("Pagination transcription invalide.", 502);
          if (!next || body.length >= cap) break;
        }
        const complete = !next && body.length <= cap && transcript.state === "FILE_GENERATED";
        items.push({
          provider_id: id,
          title: "Réunion Google Meet · " + text(conference.startTime, 40),
          starts_at: conference.startTime ?? null,
          transcript: body.slice(0, cap),
          transcript_complete: complete,
        });
        partial ||= !complete;
      }
    }
  } else if (p === "microsoft-teams") {
    const query = new URLSearchParams({
      startDateTime: window.start,
      endDateTime: window.end,
      $top: "1",
      $select: "subject,start,organizer,onlineMeeting,isCancelled",
    });
    const list = await json(
      window.page
        ? graphPage(window.page, "calendarView")
        : "https://graph.microsoft.com/v1.0/me/calendarView?" + query,
      { Prefer: 'outlook.timezone="UTC"' },
    );
    page = list["@odata.nextLink"];
    for (const event of (list.value ?? []).slice(0, 1)) {
      if (event.isCancelled || !event.onlineMeeting?.joinUrl) continue;
      // Delegated transcript access applies to meetings organized by this user.
      if (text(event.organizer?.emailAddress?.address).toLowerCase() !== email.toLowerCase()) {
        partial = true;
        continue;
      }
      const filter = new URLSearchParams({
        $filter:
          "JoinWebUrl eq '" + text(event.onlineMeeting.joinUrl, 4000).replace(/'/g, "''") + "'",
      });
      const meetings = await json("https://graph.microsoft.com/v1.0/me/onlineMeetings?" + filter);
      partial ||= !!meetings["@odata.nextLink"];
      for (const meeting of (meetings.value ?? []).slice(0, 1)) {
        const id = encodeURIComponent(resource(meeting.id, /^[A-Za-z0-9_+=\/-]+$/));
        const base = "https://graph.microsoft.com/v1.0/me/onlineMeetings/" + id + "/transcripts";
        const transcripts = await json(base);
        partial ||= !!transcripts["@odata.nextLink"] || (transcripts.value?.length ?? 0) > 10;
        for (const transcript of (transcripts.value ?? []).slice(0, 10)) {
          const tid = encodeURIComponent(resource(transcript.id, /^[A-Za-z0-9_+=\/-]+$/));
          const body = transcriptText(
            await download(base + "/" + tid + "/content?$format=text/vtt", token, p),
          );
          const start = text(event.start?.dateTime, 40);
          items.push({
            provider_id: String(meeting.id) + ":" + String(transcript.id),
            title: text(event.subject, 300) || "Réunion Microsoft Teams",
            starts_at: start ? (/[Zz]$|[+-]\d{2}:\d{2}$/.test(start) ? start : start + "Z") : null,
            transcript: body.slice(0, cap),
            transcript_complete: body.length <= cap,
          });
          partial ||= body.length > cap;
        }
      }
    }
  } else {
    const query = new URLSearchParams({
      from: window.start.slice(0, 10),
      to: window.end.slice(0, 10),
      page_size: "1",
    });
    if (window.page) query.set("next_page_token", window.page);
    const list = await json("https://api.zoom.us/v2/users/me/recordings?" + query);
    page = list.next_page_token || undefined;
    for (const meeting of (list.meetings ?? []).slice(0, 1)) {
      const files = (meeting.recording_files ?? []).filter(
        (f: { recording_type?: string; status?: string }) =>
          f.recording_type === "audio_transcript" && f.status === "completed",
      );
      partial ||= files.length > 10;
      for (const file of files.slice(0, 10)) {
        const fid = resource(file.id, /^[A-Za-z0-9_-]+$/);
        const body = transcriptText(await download(String(file.download_url), token, p));
        items.push({
          provider_id: fid,
          title: text(meeting.topic, 300) || "Réunion Zoom",
          starts_at: meeting.start_time ?? null,
          transcript: body.slice(0, cap),
          transcript_complete: body.length <= cap,
        });
        partial ||= body.length > cap;
      }
    }
  }
  if (page && (typeof page !== "string" || page.length > 8000))
    throw new ApiError("Pagination fournisseur invalide.", 502);
  return {
    items,
    complete: !page,
    cursor: page
      ? { ...window, page, partial: partial || cursor.partial === true }
      : { watermark: new Date(Date.parse(window.end) - 86400000).toISOString() },
    coverage_partial: partial || cursor.partial === true,
    window_start: window.start,
    window_end: window.end,
  };
}
