import { beforeEach, describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const mocks = vi.hoisted(() => ({ external: vi.fn(), connection: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./oauth", () => ({ externalJson: mocks.external, connection: mocks.connection }));
vi.mock("@/lib/api/context", () => ({
  ApiError: class extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
  databaseError: (error: unknown) => {
    if (error) throw new Error("Database error");
  },
}));
import { synchronize } from "./sync";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.connection.mockResolvedValue({
    tokens: { access_token: "fixture", email: "owner@example.test" },
  });
});
function client() {
  const rpc = vi.fn(async (_name: string, args: { operation: string }) => ({
    data: args.operation === "claim" ? { lease: "fixture-lease", cursor: {} } : { synced: 1 },
    error: null,
  }));
  return { rpc, db: { rpc } as unknown as SupabaseClient };
}
describe("calendar conference metadata synchronization", () => {
  it("keeps documented Google fields and filters hostile conference destinations", async () => {
    const { db, rpc } = client();
    mocks.external.mockResolvedValue({
      items: [
        {
          id: "google-1",
          summary: "Review",
          start: { dateTime: "2026-10-10T10:00:00Z" },
          end: { dateTime: "2026-10-10T11:00:00Z" },
          location: "Paris",
          conferenceData: {
            entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }],
          },
        },
        { id: "google-2", hangoutLink: "https://zoom.us.attacker.test/j/1" },
      ],
    });
    await synchronize(db, "workspace", "user", "google-calendar");
    const finish = rpc.mock.calls.find(
      ([, args]) => args.operation === "finish",
    )?.[1] as unknown as { payload: { items: Record<string, unknown>[]; lease: string } };
    expect(finish.payload.items[0]).toMatchObject({
      join_url: "https://meet.google.com/abc-defg-hij",
      location: "Paris",
      ends_at: "2026-10-10T11:00:00Z",
    });
    expect(finish.payload.items[1].join_url).toBe("");
    expect(finish.payload.lease).toBe("fixture-lease");
  });
  it("uses Graph event onlineMeeting.joinUrl with its existing UTC request", async () => {
    const { db, rpc } = client();
    mocks.external.mockResolvedValue({
      value: [
        {
          id: "graph-1",
          subject: "Review",
          start: { dateTime: "2026-10-10T10:00:00" },
          end: { dateTime: "2026-10-10T11:00:00" },
          onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/123" },
          location: { displayName: "Remote" },
          attendees: [],
        },
      ],
    });
    await synchronize(db, "workspace", "user", "outlook-calendar");
    const finish = rpc.mock.calls.find(
      ([, args]) => args.operation === "finish",
    )?.[1] as unknown as { payload: { items: Record<string, unknown>[] } };
    expect(finish.payload.items[0]).toMatchObject({
      join_url: "https://teams.microsoft.com/l/meetup-join/123",
      location: "Remote",
      starts_at: "2026-10-10T10:00:00Z",
    });
    expect(mocks.external.mock.calls[0][2].headers.Prefer).toContain('outlook.timezone="UTC"');
  });
});
