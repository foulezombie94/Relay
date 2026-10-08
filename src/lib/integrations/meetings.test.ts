import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { transcriptURL, transcriptText } from "./meetings";
import { hasRequiredScopes, serviceId } from "./services";
describe("meeting import boundaries", () => {
  it("rejects token exfiltration through transcript URLs", () => {
    for (const value of [
      "http://zoom.us/transcript",
      "https://zoom.us.evil.test/transcript",
      "https://127.0.0.1/file",
      "https://user:secret@zoom.us/file",
      "https://us02web.zoom.us:8443/file",
      "https://evil.test/file",
    ])
      expect(() => transcriptURL(value, "zoom")).toThrow();
    expect(transcriptURL("https://us02web.zoom.us/rec/download/example", "zoom").hostname).toBe(
      "us02web.zoom.us",
    );
    expect(() => transcriptURL("https://zoom.us/file", "microsoft-teams")).toThrow();
  });
  it("preserves quoted transcript wording without timestamps", () => {
    expect(
      transcriptText("WEBVTT\n\n1\n00:00:00.000 --> 00:00:03.000\nThomas: Je livrerai vendredi.\n"),
    ).toBe("Thomas: Je livrerai vendredi.");
  });
  it("requires separate meeting consent and rejects prototype provider names", () => {
    expect(
      hasRequiredScopes("google-meet", ["https://www.googleapis.com/auth/gmail.readonly"]),
    ).toBe(false);
    expect(
      hasRequiredScopes("microsoft-teams", ["User.Read", "Calendars.Read", "OnlineMeetings.Read"]),
    ).toBe(false);
    expect(() => serviceId("constructor")).toThrow();
  });
});
