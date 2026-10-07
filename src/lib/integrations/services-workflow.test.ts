import { describe, expect, it } from "vitest";
import { hasCalendarWriteScope, hasRequiredScopes } from "./services";
describe("calendar permission boundaries", () => {
  it("never accepts Microsoft permission for Google or an email service", () => {
    for (const p of ["google-calendar", "gmail", "outlook"] as const)
      expect(hasCalendarWriteScope(p, "https://graph.microsoft.com/Calendars.ReadWrite")).toBe(
        false,
      );
  });
  it("handles whitespace and provider-specific permissions", () => {
    expect(
      hasCalendarWriteScope(
        "google-calendar",
        "openid\n  HTTPS://WWW.GOOGLEAPIS.COM/AUTH/CALENDAR.EVENTS\temail",
      ),
    ).toBe(true);
    expect(hasCalendarWriteScope("outlook-calendar", "User.Read\nCalendars.ReadWrite")).toBe(true);
    expect(
      hasCalendarWriteScope("outlook-calendar", "https://graph.microsoft.com/calendars.readwrite"),
    ).toBe(true);
    expect(
      hasCalendarWriteScope("outlook-calendar", "https://www.googleapis.com/auth/calendar.events"),
    ).toBe(false);
    expect(
      hasCalendarWriteScope(
        "google-calendar",
        "https://www.googleapis.com/auth/calendar.events.readonly",
      ),
    ).toBe(false);
  });
  it("accepts write as read without crossing provider boundaries", () => {
    expect(hasRequiredScopes("outlook-calendar", ["User.Read", "Calendars.ReadWrite"])).toBe(true);
    expect(
      hasRequiredScopes("google-calendar", ["https://www.googleapis.com/auth/calendar.events"]),
    ).toBe(true);
    expect(hasRequiredScopes("google-calendar", ["User.Read", "Calendars.ReadWrite"])).toBe(false);
  });
});
