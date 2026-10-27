import { describe, expect, it } from "vitest";
import { evaluateSkillCase, type SkillEvaluationObservation } from "./skill-evaluation";
import { skillTemplate, skillTemplateDefinitions } from "./skill-templates";
import { toolEffectFlags } from "@/lib/agent/contracts";

const source = "85187231-cb96-4f91-949a-b1b4a0e32cc0";
const secondSource = "85187231-cb96-4f91-949a-b1b4a0e32cc1";
describe("skill evaluation rubric on fictional observations", () => {
  it.each(skillTemplateDefinitions.map((definition) => definition.key))(
    "includes and checks normal, missing-input and adversarial fixtures for %s",
    (key) => {
      const manifest = skillTemplate(key)!;
      expect(manifest.examples.length).toBeGreaterThan(0);
      expect(manifest.tests.map((test) => test.kind)).toEqual([
        "normal",
        "missing_input",
        "adversarial",
      ]);
      for (const [index, test] of manifest.tests.entries()) {
        const observation: SkillEvaluationObservation = {
          outcome: test.expected,
          answer:
            index === 0
              ? manifest.examples[0].expected
              : index === 1
                ? "Quel périmètre souhaites-tu examiner ?"
                : "Je refuse de contourner les autorisations.",
          tool_calls: test.min_sources
            ? [manifest.tools.find((tool) => toolEffectFlags(tool).read)!]
            : [],
          source_ids: [source, secondSource].slice(0, test.min_sources),
          ...(manifest.output.format === "skill_manifest"
            ? {
                skill_result:
                  index === 0
                    ? { status: "draft", manifest: skillTemplate("brief-client")! }
                    : index === 1
                      ? { status: "clarify", questions: ["Quel résultat souhaites-tu ?"] }
                      : { status: "reject", reason: "Cette demande contourne les autorisations." },
              }
            : {}),
        };
        expect(evaluateSkillCase(manifest, index, observation)).toEqual({
          passed: true,
          issues: [],
        });
      }
    },
  );
  it("detects a forbidden send even when the answer claims to refuse it", () => {
    const result = evaluateSkillCase(skillTemplate("envoi-relance")!, 2, {
      outcome: "reject",
      answer: "Je refuse.",
      tool_calls: ["send_email"],
      source_ids: [],
    });
    expect(result.passed).toBe(false);
    expect(result.issues).toContain("forbidden_effect");
  });
  it("does not accept an unevaluated or prose-only creator result", () => {
    const manifest = skillTemplate("creer-skill")!;
    const result = evaluateSkillCase(manifest, 0, {
      outcome: "answer",
      answer: "Brouillon prêt.",
      tool_calls: [],
      source_ids: [],
      skill_result: "Un prompt libre",
    });
    expect(result.issues).toContain("invalid_skill_result");
    const inconsistent = evaluateSkillCase(manifest, 2, {
      outcome: "reject",
      answer: "Je refuse.",
      tool_calls: [],
      source_ids: [],
      skill_result: { status: "draft", manifest: skillTemplate("note")! },
    });
    expect(inconsistent.issues).toContain("inconsistent_structured_outcome");
  });
  it("checks source cardinality, budgets and actual allowed tools", () => {
    const result = evaluateSkillCase(skillTemplate("comparer-comptes")!, 0, {
      outcome: "answer",
      answer: "Comparaison disponible.",
      tool_calls: Array(11).fill("send_email"),
      source_ids: [source, source],
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        "insufficient_sources",
        "tool_budget_exceeded",
        "tool_outside_scope",
      ]),
    );
  });
});
