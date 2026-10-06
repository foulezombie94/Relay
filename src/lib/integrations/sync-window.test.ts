import { expect, it, vi, afterEach } from "vitest";
import { syncWindow, graphPage } from "./sync-window";
it("resumes the exact provider page and fixed window after a failure", () => {
  expect(
    syncWindow(
      {
        page: "opaque",
        start: "2026-10-01T00:00:00Z",
        end: "2026-10-06T00:00:00Z",
      },
      "email",
      new Date("2026-10-07T00:00:00Z"),
    ),
  ).toEqual({
    page: "opaque",
    start: "2026-10-01T00:00:00Z",
    end: "2026-10-06T00:00:00Z",
  });
});
it("overlaps the last email watermark by five minutes to avoid boundary losses", () => {
  expect(
    syncWindow(
      { watermark: "2026-10-06T10:00:00Z" },
      "email",
      new Date("2026-10-06T11:00:00Z"),
    ).start,
  ).toBe("2026-10-06T09:55:00.000Z");
});
it("blocks token-bearing pagination links to another host or endpoint", () => {
  for (const v of [
    "https://evil.invalid/v1.0/me/messages",
    "https://graph.microsoft.com/v1.0/me/sendMail",
    "https://user:pass@graph.microsoft.com/v1.0/me/messages",
    "https://graph.microsoft.com:444/v1.0/me/messages",
  ])
    expect(() => graphPage(v, "messages")).toThrow();
  expect(
    graphPage(
      "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=opaque",
      "messages",
    ),
  ).toContain("$skiptoken=opaque");
});
