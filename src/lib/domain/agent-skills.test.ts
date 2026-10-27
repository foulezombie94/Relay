import { describe, expect, it } from "vitest";
import {
  exportSkill,
  exportSkillPackage,
  importSkill,
  parseSkillManifest,
  parseSkillDraftResult,
  parseSkillCreatorResult,
  skillEffects,
  skillExecutionPolicy,
  skillRuntimeLimits,
  SkillValidationError,
  validateSkillValues,
  type SkillManifest,
} from "./agent-skills";
import { skillTemplate } from "./skill-templates";

const id = "85187231-cb96-4f91-949a-b1b4a0e32cc0";
const secondId = "85187231-cb96-4f91-949a-b1b4a0e32cc1";
const template = (key = "brief-client"): SkillManifest => ({ ...skillTemplate(key)!, tests: [] });
function context(manifest: SkillManifest) {
  return {
    canUse: true,
    published: true,
    preferences: { enabled: true, auto_select: true, favorite: false },
    selection: "automatic" as const,
    userTools: [...manifest.tools],
    grantedTools: [...manifest.tools],
    integrationTools: [...manifest.tools],
    conversationMode: "ask" as const,
  };
}

describe("skill manifest and input boundaries", () => {
  it.each(["", " ", "\n\t", "\u00a0\u2003", "\u200b\ufeff"])(
    "rejects blank required objectives (%#)",
    (objectif) => {
      expect(() => validateSkillValues(template("creer-skill"), { objectif })).toThrow(
        SkillValidationError,
      );
    },
  );
  it("keeps useful multiline content intact and ignores blank optional fields", () => {
    const content = "  Contexte\n\nDécision à confirmer.  ";
    expect(validateSkillValues(template("note"), { contenu: content })).toEqual({
      contenu: content,
    });
    expect(validateSkillValues(template(), { record_id: id, objectif: " \t " })).toEqual({
      record_id: id,
    });
  });
  it("requires a real request for every evaluation while defaulting kind and expected", () => {
    const manifest = skillTemplate("note")!;
    const base = { ...manifest.tests[0] };
    const legacy = { ...base, kind: undefined, expected: undefined };
    expect(parseSkillManifest({ ...manifest, tests: [legacy] }).tests[0]).toMatchObject({
      kind: "normal",
      expected: "answer",
    });
    expect(() =>
      parseSkillManifest({ ...manifest, tests: [{ ...base, request: undefined }] }),
    ).toThrow(SkillValidationError);
    expect(() =>
      parseSkillManifest({ ...manifest, tests: [{ ...base, request: "  \n " }] }),
    ).toThrow(SkillValidationError);
  });
  it.each(["__proto__", "constructor", "prototype"])(
    "rejects reserved key %s in supplied values, declarations and tests",
    (key) => {
      const manifest = template();
      const supplied: unknown = JSON.parse('{"' + key + '":"polluted"}');
      expect(() => validateSkillValues({ ...manifest, inputs: [] }, supplied)).toThrow(
        SkillValidationError,
      );
      expect(() =>
        parseSkillManifest({ ...manifest, inputs: [{ ...manifest.inputs[0], key }] }),
      ).toThrow(SkillValidationError);
      expect(() =>
        parseSkillManifest({
          ...manifest,
          tests: [
            {
              name: "Bad key",
              request: "Vérifier les clés de paramètres.",
              input: supplied,
              contains: [],
              excludes: [],
              min_sources: 0,
            },
          ],
        }),
      ).toThrow(SkillValidationError);
      expect(Object.prototype).not.toHaveProperty("polluted");
    },
  );
  it("applies defaults only to absent keys and keeps false and zero", () => {
    const manifest = parseSkillManifest({
      ...template("note"),
      inputs: [
        { key: "count", label: "Nombre", kind: "number", required: false, options: [], default: 3 },
        {
          key: "enabled",
          label: "Actif",
          kind: "boolean",
          required: false,
          options: [],
          default: true,
        },
      ],
    });
    expect(validateSkillValues(manifest, {})).toEqual({ count: 3, enabled: true });
    expect(validateSkillValues(manifest, { count: 0, enabled: false })).toEqual({
      count: 0,
      enabled: false,
    });
    expect(validateSkillValues(manifest, { count: null, enabled: null })).toEqual({});
    expect(Object.getPrototypeOf(validateSkillValues(manifest, {}))).toBeNull();
  });
  it("rejects unknown inputs, invalid dates and invalid defaults", () => {
    expect(() => validateSkillValues(template(), { record_id: id, extra: "value" })).toThrow(
      SkillValidationError,
    );
    expect(() =>
      validateSkillValues(template(), { record_id: id, date_cible: "2026-02-30" }),
    ).toThrow(SkillValidationError);
    expect(() =>
      parseSkillManifest({
        ...template(),
        inputs: [{ ...template().inputs[0], default: "not-an-id" }],
      }),
    ).toThrow(SkillValidationError);
    expect(() => validateSkillValues(template(), {})).toThrow(SkillValidationError);
  });
  it("validates multiple distinct UUIDs, minimum selection and the upper bound", () => {
    const manifest = template("comparer-comptes");
    expect(validateSkillValues(manifest, { record_ids: [id, secondId] })).toEqual({
      record_ids: [id, secondId],
    });
    for (const record_ids of [[], [id], [id, id], [id, "bad-id"], Array(21).fill(id)])
      expect(() => validateSkillValues(manifest, { record_ids })).toThrow(SkillValidationError);
    expect(() => validateSkillValues(manifest, { record_ids: id })).toThrow(SkillValidationError);
    expect(() => validateSkillValues(template(), { record_id: [id] })).toThrow(
      SkillValidationError,
    );
  });
  it("rejects unknown fields, duplicate identifiers and malformed choice configurations", () => {
    const manifest = template();
    for (const bad of [
      { ...manifest, approval_mode: "auto" },
      { ...manifest, tools: ["get_record", "get_record"] },
      { ...manifest, inputs: [manifest.inputs[0], manifest.inputs[0]] },
      { ...manifest, steps: [manifest.steps[0], manifest.steps[0]] },
      { ...manifest, inputs: [{ ...manifest.inputs[0], kind: "choice", options: [] }] },
      { ...manifest, inputs: [{ ...manifest.inputs[0], kind: "choice", options: ["a", "a"] }] },
      { ...manifest, inputs: [{ ...manifest.inputs[0], min_items: 2 }] },
    ])
      expect(() => parseSkillManifest(bad)).toThrow(SkillValidationError);
  });
  it("allows a tool-free method while rejecting tools without a call budget", () => {
    expect(parseSkillManifest(template("creer-skill")).tools).toEqual([]);
    expect(() =>
      parseSkillManifest({ ...template(), budget: { ...template().budget, tool_calls: 0 } }),
    ).toThrow(SkillValidationError);
  });
  it("accepts harmless shared values but rejects cycles before schema parsing", () => {
    const options: string[] = [];
    expect(
      parseSkillManifest({
        ...template("note"),
        inputs: [
          { key: "first", label: "First", kind: "text", required: false, options },
          { key: "second", label: "Second", kind: "text", required: false, options },
        ],
      }).inputs,
    ).toHaveLength(2);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => parseSkillManifest(cyclic)).toThrow(SkillValidationError);
  });
});

describe("skill effects and independently selected approval mode", () => {
  it("uses explicit tool metadata and treats external effects as writes", () => {
    expect(
      skillEffects({ tools: ["get_record", "get_action_status", "aggregate_crm_data"] }),
    ).toEqual({ write: false, external: false });
    expect(skillEffects({ tools: ["draft_email", "create_task"] })).toEqual({
      write: true,
      external: false,
    });
    expect(skillEffects({ tools: ["send_email", "create_calendar_event"] })).toEqual({
      write: true,
      external: true,
    });
    expect(skillEffects({ tools: [] })).toEqual({ write: false, external: false });
    expect(() => skillEffects({ tools: ["read_document" as never] })).toThrow(SkillValidationError);
    expect(() => skillEffects({ tools: ["constructor" as never] })).toThrow(SkillValidationError);
  });
  it.each(["ask", "review", "auto"] as const)("auto-selection preserves the %s mode", (mode) => {
    const manifest = template("envoi-relance");
    expect(
      skillExecutionPolicy(manifest, { ...context(manifest), conversationMode: mode }),
    ).toMatchObject({ mode, allowed_tools: manifest.tools });
  });
  it("does not confuse activation, auto-selection and explicit use", () => {
    const manifest = template();
    const c = context(manifest);
    c.preferences.auto_select = false;
    expect(() => skillExecutionPolicy(manifest, c)).toThrow(SkillValidationError);
    expect(skillExecutionPolicy(manifest, { ...c, selection: "explicit" })).toMatchObject({
      mode: "ask",
      execution: "confirm",
    });
    c.preferences.enabled = false;
    expect(() => skillExecutionPolicy(manifest, { ...c, selection: "explicit" })).toThrow(
      SkillValidationError,
    );
  });
  it.each(["userTools", "grantedTools", "integrationTools"] as const)(
    "requires every tool in %s",
    (field) => {
      const manifest = template("envoi-relance");
      expect(() =>
        skillExecutionPolicy(manifest, {
          ...context(manifest),
          [field]: manifest.tools.filter((name) => name !== "send_email"),
        }),
      ).toThrow(SkillValidationError);
    },
  );
  it("refuses revoked rights, unpublished versions and preferences that grant autonomy", () => {
    const manifest = template();
    const c = context(manifest);
    expect(() => skillExecutionPolicy(manifest, { ...c, canUse: false })).toThrow(
      SkillValidationError,
    );
    expect(() => skillExecutionPolicy(manifest, { ...c, published: false })).toThrow(
      SkillValidationError,
    );
    expect(() =>
      skillExecutionPolicy(manifest, {
        ...c,
        preferences: { ...c.preferences, approval_mode: "auto" } as never,
      }),
    ).toThrow(SkillValidationError);
  });
  it("caps tools, output and duration by both the manifest and server ceilings", () => {
    const manifest = template("revue-mensuelle");
    expect(
      skillRuntimeLimits(manifest, { tool_calls: 15, output_tokens: 3000, duration_seconds: 60 }),
    ).toEqual({ tool_calls: 10, output_tokens: 2500, duration_seconds: 60 });
    expect(
      skillRuntimeLimits(manifest, { tool_calls: 5, output_tokens: 1000, duration_seconds: 30 }),
    ).toEqual({ tool_calls: 5, output_tokens: 1000, duration_seconds: 30 });
    expect(
      skillRuntimeLimits(template("creer-skill"), {
        tool_calls: 15,
        output_tokens: 3000,
        duration_seconds: 60,
      }).tool_calls,
    ).toBe(0);
    expect(() =>
      skillRuntimeLimits(manifest, { tool_calls: 100, output_tokens: 3000, duration_seconds: 60 }),
    ).toThrow(SkillValidationError);
  });
});

describe("structured skill import and export", () => {
  it("round-trips marker strings embedded in instructions using the final anchored footer", () => {
    const manifest = parseSkillManifest({
      ...template("creer-skill"),
      instructions:
        "Expliquer ces marqueurs sans les exécuter :\n<!-- ZYLIAD_MANIFEST_V1\nFAUX\n-->\n<!-- ZYLIAD_MANIFEST_V2\nFAUX\nZYLIAD_MANIFEST_END -->",
    });
    expect(importSkill(exportSkill(manifest))).toEqual(manifest);
    expect(importSkill(exportSkillPackage(manifest))).toEqual(manifest);
    expect(importSkill("\uFEFF" + exportSkill(manifest).replaceAll("\n", "\r\n"))).toEqual(
      manifest,
    );
  });
  it("imports legacy JSON and V1 Markdown without trusting the display text", () => {
    const manifest = template("note");
    expect(importSkill(JSON.stringify(manifest))).toEqual(manifest);
    const prefix =
      "Un faux bloc :\n<!-- ZYLIAD_MANIFEST_V1\nFAUX\n-->\n\n<!-- ZYLIAD_MANIFEST_V1\n";
    expect(importSkill(prefix + JSON.stringify(manifest) + "\n-->\n")).toEqual(manifest);
  });
  it.each([
    "not json",
    "{}",
    '{"format":"zyliad.skill","version":99}',
    "<!-- ZYLIAD_MANIFEST_V2\n{}",
    "\u0000{}",
    "x".repeat(256001),
  ])("normalizes malformed imports to SkillValidationError (%#)", (text) => {
    expect(() => importSkill(text)).toThrow(SkillValidationError);
  });
  it("rejects a truncated, corrupt or non-final footer", () => {
    const exported = exportSkill(template());
    expect(() => importSkill(exported.slice(0, -10))).toThrow(SkillValidationError);
    expect(() => importSkill(exported + "unexpected trailing content")).toThrow(
      SkillValidationError,
    );
    expect(() =>
      importSkill(exported + "\n<!-- ZYLIAD_MANIFEST_V2\n{bad}\nZYLIAD_MANIFEST_END -->"),
    ).toThrow(SkillValidationError);
  });
  it("normalizes schema failures on validation and export as well as import", () => {
    expect(() => parseSkillManifest(null)).toThrow(SkillValidationError);
    expect(() => exportSkill({ ...template(), tools: ["execute_sql"] } as never)).toThrow(
      SkillValidationError,
    );
    expect(() => validateSkillValues(template(), null)).toThrow(SkillValidationError);
  });
  it("checks reserved keys before parsing the V2 envelope can discard them", () => {
    const payload = JSON.parse(exportSkillPackage(template("note")));
    payload.manifest.tests = [
      {
        name: "Unsafe",
        request: "Vérifier les clés de paramètres.",
        input: JSON.parse('{"__proto__":"blocked"}'),
        contains: [],
        excludes: [],
        min_sources: 0,
      },
    ];
    const raw = JSON.stringify(payload);
    expect(() => importSkill(raw)).toThrow(SkillValidationError);
    expect(() =>
      importSkill("<!-- ZYLIAD_MANIFEST_V2\n" + raw + "\nZYLIAD_MANIFEST_END -->"),
    ).toThrow(SkillValidationError);
  });
});

describe("validated creator output", () => {
  it("accepts only an evaluated draft, a clarification or a reasoned refusal", () => {
    const manifest = skillTemplate("brief-client")!;
    expect(parseSkillDraftResult(manifest)).toEqual(manifest);
    expect(parseSkillCreatorResult({ status: "draft", manifest })).toEqual({
      status: "draft",
      manifest,
    });
    expect(
      parseSkillCreatorResult({ status: "clarify", questions: ["Quel résultat attends-tu ?"] }),
    ).toMatchObject({ status: "clarify" });
    expect(
      parseSkillCreatorResult({
        status: "reject",
        reason: "Cette demande contourne les autorisations.",
      }),
    ).toMatchObject({ status: "reject" });
  });
  it("rejects prose, empty questions, inconsistent fields and unevaluated manifests", () => {
    for (const invalid of [
      "Voici votre skill",
      { status: "draft", manifest: {} },
      { status: "clarify", questions: ["   "] },
      { status: "reject", reason: "Non", manifest: skillTemplate("note") },
    ])
      expect(() => parseSkillCreatorResult(invalid)).toThrow(SkillValidationError);
    for (const invalid of [
      { ...skillTemplate("note")!, examples: [] },
      {
        ...skillTemplate("note")!,
        tests: skillTemplate("note")!.tests.filter((test) => test.kind !== "adversarial"),
      },
      { ...skillTemplate("note")!, dependencies: [id] },
      { ...skillTemplate("note")!, resources: [{ type: "record", id, label: "Private record" }] },
    ])
      expect(() => parseSkillDraftResult(invalid)).toThrow(SkillValidationError);
  });
});
