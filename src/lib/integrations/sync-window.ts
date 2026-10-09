export type SyncWindow = { start: string; end: string; page?: string };
export function syncWindow(
  cursor: Record<string, unknown>,
  kind: "email" | "calendar",
  now = new Date(),
): SyncWindow {
  if (
    typeof cursor.page === "string" &&
    typeof cursor.start === "string" &&
    typeof cursor.end === "string"
  )
    return { start: cursor.start, end: cursor.end, page: cursor.page };
  if (kind === "calendar")
    return {
      start: now.toISOString(),
      end: new Date(now.getTime() + 30 * 86400000).toISOString(),
    };
  const mark = typeof cursor.watermark === "string" ? Date.parse(cursor.watermark) : NaN;
  return {
    start: new Date(
      Number.isFinite(mark) ? mark - 300000 : now.getTime() - 30 * 86400000,
    ).toISOString(),
    end: now.toISOString(),
  };
}
export function graphPage(value: string, kind: "messages" | "calendarView") {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "graph.microsoft.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !new RegExp("^/v1\\.0/(?:me|users/[^/]+)/" + kind + "/?$").test(url.pathname)
  )
    throw new Error("Adresse de pagination Microsoft invalide.");
  return url.toString();
}
