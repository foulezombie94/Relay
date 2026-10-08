import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { visibleHistory } from "@/lib/api/assistant-context";
import type { SupabaseClient } from "@supabase/supabase-js";
describe("revoked historical evidence", () => {
  it("redacts answers and prepared actions after an access fingerprint changes, even without citations", async () => {
    const client = {
      rpc: vi.fn(async (name) => ({
        data: name === "agent_visible_sources" ? [] : "new-permissions",
      })),
    } as unknown as SupabaseClient;
    const [message] = await visibleHistory(client, "w", [
      {
        id: "m",
        role: "assistant",
        answer: "Old aggregate or private facts",
        access_fingerprint: "old-permissions",
        actions: [{ id: "a", kind: "draft_email", status: "draft", input: { body: "private" } }],
      },
    ]);
    expect(message.answer).not.toContain("Old aggregate");
    expect(message.actions).toEqual([]);
  });
  it("never retains an answer if any consulted source is no longer authorized", async () => {
    const client = {
      rpc: vi.fn(async (name) => ({ data: name === "agent_visible_sources" ? [] : "same" })),
    } as unknown as SupabaseClient;
    const [message] = await visibleHistory(client, "w", [
      {
        id: "m",
        role: "assistant",
        answer: "Private details",
        sources: [
          {
            id: "85187231-cb96-4f91-949a-b1b4a0e32cc0",
            type: "email",
            label: "email",
            record_id: null,
          },
        ],
      },
    ]);
    expect(message.answer).not.toContain("Private details");
    expect(message.sources).toEqual([]);
  });
});
