import { describe, expect, it } from "vitest";
import { renderWorkflowText, readVariable } from "./workflow-variables";
describe("workflow variables", () => {
  it("uses prior block results without escaping corruption", () => {
    expect(
      renderWorkflowText("{{contact.first_name}}: {{steps.analyse.summary}}", {
        contact: { first_name: "Alice" },
        steps: { analyse: { summary: 'A\\B "$&"' } },
      }),
    ).toBe('Alice: A\\B "$&"');
  });
  it("refuses missing or object values and prototype traversal", () => {
    expect(readVariable({ record: {} }, "record.constructor.name")).toBeUndefined();
    expect(() => renderWorkflowText("{{steps.missing.summary}}", {})).toThrow();
    expect(() => renderWorkflowText("{{record}}", { record: { name: "Alice" } })).toThrow();
  });
});
