import { describe, it, expect } from "vitest";
import { progressiveTools, discoveryInstructionsFor, runToolLimit } from "./discovery";
import { toolSchemas } from "./contracts";
describe("progressive tool catalogue", () => {
  it("provides no implicit base tools or discovery to a method with no tools", () => {
    const t = progressiveTools([]);
    expect(t.definitions()).toEqual([]);
    expect(t.allows("search_records")).toBe(false);
    expect(t.allows("discover_tools")).toBe(false);
    expect(() => t.discover({ names: ["get_record"] })).toThrow();
    expect(t.definitions()).toEqual([]);
  });
  it("cannot discover tools outside the server-derived intersection, even in a mixed request", () => {
    const t = progressiveTools(["get_record", "search_meetings"]);
    expect(t.definitions().map((tool) => tool.function.name)).toEqual([
      "get_record",
      "discover_tools",
    ]);
    expect(() => t.discover({ names: ["search_meetings", "send_email"] })).toThrow();
    expect(t.allows("search_meetings")).toBe(false);
    t.discover({ names: ["search_meetings"] });
    expect(t.allows("search_meetings")).toBe(true);
    expect(t.allows("search_records")).toBe(false);
    expect(t.allows("send_email")).toBe(false);
    expect(JSON.stringify(t.definitions())).not.toContain("send_email");
  });
  it("keeps every business tool reachable with a bounded transport catalogue", () => {
    const t = progressiveTools();
    expect(t.definitions()).toHaveLength(8);
    const names = Object.keys(toolSchemas);
    expect(names).toHaveLength(37);
    for (const name of names) {
      t.discover({ names: [name] });
      expect(t.allows(name)).toBe(true);
      expect(t.definitions().some((d) => d.function.name === name)).toBe(true);
      expect(t.definitions().length).toBeLessThanOrEqual(names.length + 1);
    }
    expect(t.definitions()).toHaveLength(38);
    for (const name of names) expect(t.allows(name)).toBe(true);
  });
  it("retains earlier tools across discoveries and does not duplicate schemas", () => {
    const t = progressiveTools();
    t.discover({ names: ["draft_email", "get_email_thread"] });
    const result = t.discover({ names: ["send_email", "draft_email", "search_records"] });
    expect(result.available_tools).toEqual(
      expect.arrayContaining(["draft_email", "get_email_thread", "send_email", "search_records"]),
    );
    expect(result.changed).toBe(true);
    for (const name of ["draft_email", "get_email_thread", "send_email"])
      expect(t.definitions().filter((d) => d.function.name === name)).toHaveLength(1);
    expect(t.discover({ names: ["draft_email", "search_records"] }).changed).toBe(false);
  });
  it("keeps catalogues isolated per run and leaves state unchanged after invalid discovery", () => {
    const first = progressiveTools();
    first.discover({ names: ["draft_email"] });
    const before = first.definitions();
    expect(() => first.discover({ names: ["send_email", "execute_sql"] })).toThrow();
    expect(first.definitions()).toEqual(before);
    expect(first.allows("send_email")).toBe(false);
    expect(progressiveTools().allows("draft_email")).toBe(false);
  });
  it("tells the model which tools are already loaded so it does not rediscover them", () => {
    const text = discoveryInstructionsFor();
    expect(text).toContain("déjà chargés");
    expect(text).toContain("search_records");
    expect(discoveryInstructionsFor(["search_meetings"])).toContain("Aucun outil n’est chargé");
  });
  it("admits the discovery allowance within the database ceiling of 15 calls", () => {
    expect(runToolLimit(5)).toBe(7);
    expect(runToolLimit(14)).toBe(15);
    expect(runToolLimit(15)).toBe(15);
    expect(runToolLimit(0)).toBe(3);
  });
  it("rejects unknown tools, hidden arguments and oversized discovery requests", () => {
    const t = progressiveTools();
    expect(t.allows("send_email")).toBe(false);
    expect(() => t.discover({ names: ["execute_sql"] })).toThrow();
    expect(() => t.discover({ names: ["send_email"], authorized: true })).toThrow();
    expect(() => t.discover({ names: Array(7).fill("send_email") })).toThrow();
  });
});
