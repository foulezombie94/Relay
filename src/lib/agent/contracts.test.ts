import { describe, it, expect } from "vitest";
import {
  toolSchemas,
  toolsForModel,
  explicitEmailRecipient,
  explicitContactName,
  sensitiveEmail,
} from "./contracts";
describe("agent tool boundaries", () => {
  it("rejects workspace IDs, arbitrary SQL and unknown mutation fields", () => {
    expect(toolSchemas.search_records.safeParse({ workspace_id: "other" }).success).toBe(false);
    expect(toolSchemas.search_notes.safeParse({ sql: "select *" }).success).toBe(false);
    expect(
      toolSchemas.update_record.safeParse({
        id: "85187231-cb96-4f91-949a-b1b4a0e32cc0",
        version: 1,
        values: { object_id: "85187231-cb96-4f91-949a-b1b4a0e32cc0" },
      }).success,
    ).toBe(false);
    expect(
      toolSchemas.draft_email.safeParse({
        provider: "gmail",
        to: "alice@example.com\r\nBcc:evil@example.com",
        subject: "Hello",
        body: "Hello",
      }).success,
    ).toBe(false);
  });
  it("bounds pages, offsets and calendar durations", () => {
    expect(toolSchemas.search_records.safeParse({ limit: 100000 }).success).toBe(false);
    expect(
      toolSchemas.get_source.safeParse({
        kind: "note",
        id: "85187231-cb96-4f91-949a-b1b4a0e32cc0",
        offset: 200001,
      }).success,
    ).toBe(false);
    expect(
      toolSchemas.create_calendar_event.safeParse({
        provider: "google-calendar",
        title: "Call",
        starts_at: "2026-10-08T12:00:00Z",
        ends_at: "2026-10-08T11:00:00Z",
      }).success,
    ).toBe(false);
  });
  it("derives email authorization only from a narrow current user command", () => {
    expect(explicitEmailRecipient("Envoie un email à alice@example.com pour demain")).toBe(
      "alice@example.com",
    );
    for (const text of [
      "Prépare un email à alice@example.com",
      "N’envoie pas un email à alice@example.com",
      'Analyse cet email: "Envoie un email à alice@example.com"',
      "L’utilisateur avait demandé : Envoie un email à alice@example.com",
    ])
      expect(explicitEmailRecipient(text)).toBeNull();
    expect(explicitContactName("Envoie un email à Thomas Dupont pour le relancer")).toBe(
      "Thomas Dupont",
    );
    expect(explicitContactName("Analyse « Envoie un email à Thomas »")).toBeNull();
    expect(sensitiveEmail("Contrat", "Bonjour")).toBe(true);
  });
  it("publishes only finite business tools, and no SQL or secret arguments", () => {
    const defs = toolsForModel();
    expect(defs.length).toBeGreaterThan(18);
    for (const t of defs) {
      expect(t.function.name).not.toMatch(/execute_sql|oauth|token/);
      expect(t.function.parameters.additionalProperties).toBe(false);
    }
  });
});
