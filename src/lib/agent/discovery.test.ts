import { describe, it, expect } from "vitest";
import { progressiveTools } from "./discovery";
import { toolSchemas } from "./contracts";
describe("progressive tool catalogue", () => {
  it("keeps every business tool reachable with a bounded transport catalogue", () => {
    const t = progressiveTools();
    expect(t.definitions()).toHaveLength(8);
    const names = Object.keys(toolSchemas);
    expect(names).toHaveLength(37);
    for (const name of names) {
      t.discover({ names: [name] });
      expect(t.allows(name)).toBe(true);
      expect(t.definitions().some((d) => d.function.name === name)).toBe(true);
      expect(t.definitions().length).toBeLessThanOrEqual(14);
    }
  });
  it("rejects unknown tools, hidden arguments and oversized discovery requests", () => {
    const t = progressiveTools();
    expect(t.allows("send_email")).toBe(false);
    expect(() => t.discover({ names: ["execute_sql"] })).toThrow();
    expect(() => t.discover({ names: ["send_email"], authorized: true })).toThrow();
    expect(() => t.discover({ names: Array(7).fill("send_email") })).toThrow();
  });
});
