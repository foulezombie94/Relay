import { z } from "zod";
import { toolSchemas, type ToolName } from "@/lib/agent/contracts";
import {
  parseSkillCreatorResult,
  parseSkillManifest,
  skillSearch,
  SkillValidationError,
  type SkillManifest,
} from "./agent-skills";

const names = Object.keys(toolSchemas) as [ToolName, ...ToolName[]];
const observationSchema = z
  .object({
    outcome: z.enum(["answer", "clarify", "reject"]),
    answer: z.string().trim().min(1).max(20000),
    tool_calls: z.array(z.enum([...names, "discover_tools"])).max(100),
    source_ids: z.array(z.uuid()).max(100),
    skill_result: z.unknown().optional(),
  })
  .strict();
export type SkillEvaluationObservation = z.infer<typeof observationSchema>;

// Tool traces and source IDs must come from the server, never from the model's
// account of what it claims to have done. This rubric is not a semantic judge.
export function evaluateSkillCase(
  manifest: SkillManifest,
  caseIndex: number,
  observation: unknown,
) {
  const checked = parseSkillManifest(manifest);
  if (!Number.isInteger(caseIndex) || !checked.tests[caseIndex])
    throw new SkillValidationError("Cas d’évaluation introuvable.");
  const test = checked.tests[caseIndex];
  const parsed = observationSchema.safeParse(observation);
  if (!parsed.success) return { passed: false, issues: ["invalid_observation"] };
  const actual = parsed.data;
  const issues: string[] = [];
  if (actual.outcome !== test.expected) issues.push("unexpected_outcome");
  if (actual.tool_calls.length > checked.budget.tool_calls) issues.push("tool_budget_exceeded");
  if (
    actual.tool_calls.some((tool) =>
      tool === "discover_tools" ? !checked.tools.length : !checked.tools.includes(tool),
    )
  )
    issues.push("tool_outside_scope");
  if (
    actual.tool_calls.some(
      (tool) => tool !== "discover_tools" && test.forbidden_tools.includes(tool),
    )
  )
    issues.push("forbidden_effect");
  if (new Set(actual.source_ids).size < test.min_sources) issues.push("insufficient_sources");
  const answer = skillSearch(actual.answer);
  if (test.contains.some((term) => !answer.includes(skillSearch(term))))
    issues.push("missing_required_content");
  if (test.excludes.some((term) => answer.includes(skillSearch(term))))
    issues.push("excluded_content");
  if (checked.output.format === "skill_manifest") {
    try {
      const result = parseSkillCreatorResult(actual.skill_result);
      if ((result.status === "draft" ? "answer" : result.status) !== actual.outcome)
        issues.push("inconsistent_structured_outcome");
    } catch {
      issues.push("invalid_skill_result");
    }
  }
  return { passed: !issues.length, issues };
}
