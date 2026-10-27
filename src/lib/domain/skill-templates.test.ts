import { describe, expect, it } from "vitest";
import { skillTemplate, skillTemplateDefinitions } from "./skill-templates";
import { parseSkillManifest, skillEffects } from "./agent-skills";

describe("business skill templates", () => {
  it.each(skillTemplateDefinitions.map((definition) => definition.key))(
    "provides a valid, bounded and independently described %s method",
    (key) => {
      const manifest = skillTemplate(key)!;
      expect(parseSkillManifest(manifest)).toEqual(manifest);
      expect(manifest.budget.tool_calls).toBeLessThanOrEqual(15);
      expect(manifest.budget.duration_seconds).toBeLessThanOrEqual(60);
      expect(manifest.tags).not.toEqual([manifest.category]);
      expect(manifest.use_when).not.toEqual([manifest.description]);
      expect(manifest.avoid_when.length).toBeGreaterThan(0);
    },
  );
  it("keeps conception and supplied-text writing completely separate from CRM access", () => {
    for (const key of ["creer-skill", "note"]) {
      const manifest = skillTemplate(key)!;
      expect(manifest.tools).toEqual([]);
      expect(manifest.budget.tool_calls).toBe(0);
      expect(skillEffects(manifest)).toEqual({ write: false, external: false });
    }
  });
  it("keeps preparing a follow-up separate from sending it", () => {
    const prepare = skillTemplate("relance")!;
    const send = skillTemplate("envoi-relance")!;
    expect(prepare.tools).toContain("draft_email");
    expect(prepare.tools).not.toContain("send_email");
    expect(skillEffects(prepare)).toEqual({ write: true, external: false });
    expect(send.tools).toContain("send_email");
    expect(skillEffects(send)).toEqual({ write: true, external: true });
  });
  it("asks for method-specific inputs and uses appropriate budgets", () => {
    expect(
      skillTemplate("comparer-comptes")!.inputs.find((input) => input.key === "record_ids"),
    ).toMatchObject({ kind: "records", required: true, min_items: 2 });
    expect(skillTemplate("renouvellement")!.inputs.map((input) => input.key)).toEqual([
      "record_id",
      "date_cible",
      "periode",
    ]);
    expect(skillTemplate("pipeline")!.inputs.map((input) => input.key)).toEqual([
      "periode",
      "owner",
      "pipeline",
    ]);
    const budgets = {
      "brief-client": 8,
      "bilan-client": 8,
      "revue-mensuelle": 10,
      pipeline: 6,
      "comparer-comptes": 10,
    };
    for (const [key, calls] of Object.entries(budgets))
      expect(skillTemplate(key)!.budget.tool_calls).toBe(calls);
  });
  it("provides distinct progress steps and detached manifests", () => {
    const brief = skillTemplate("brief-client")!;
    const pipeline = skillTemplate("pipeline")!;
    expect(brief.steps).toHaveLength(5);
    expect(pipeline.steps).toHaveLength(5);
    expect(brief.steps.map((step) => step.title)).not.toEqual(
      pipeline.steps.map((step) => step.title),
    );
    brief.tools.push("send_email");
    brief.inputs[0].label = "Changed";
    expect(skillTemplate("brief-client")!.tools).not.toContain("send_email");
    expect(skillTemplate("brief-client")!.inputs[0].label).toBe("Contact ou entreprise");
    expect(skillTemplate("unknown")).toBeUndefined();
  });
});
