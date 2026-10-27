import { z } from "zod";
import { toolSchemas, toolEffectFlags, type ToolName } from "@/lib/agent/contracts";
import { assistantApprovalMode, type AssistantApprovalMode } from "./assistant-approval";

const toolNames = Object.keys(toolSchemas) as [ToolName, ...ToolName[]];
const key = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,39}$/)
  .refine((v) => !["constructor", "prototype", "__proto__"].includes(v));
const primitive = z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()]);
const inputValue = z.union([primitive, z.array(z.uuid()).min(1).max(20)]);
export const skillInputSchema = z
  .object({
    key,
    label: z.string().trim().min(1).max(100),
    kind: z.enum(["text", "long_text", "record", "records", "date", "number", "choice", "boolean"]),
    required: z.boolean(),
    options: z.array(z.string().min(1).max(100)).max(30),
    min_items: z.number().int().min(1).max(20).optional(),
    default: inputValue.optional(),
  })
  .strict();
export const skillManifestSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().min(10).max(500),
    category: z.enum(["commercial", "suivi", "analyse", "redaction", "organisation"]),
    tags: z.array(z.string().trim().min(1).max(30)).max(8),
    instructions: z.string().trim().min(10).max(12000),
    use_when: z.array(z.string().trim().min(1).max(300)).max(8),
    avoid_when: z.array(z.string().trim().min(1).max(300)).max(8),
    inputs: z.array(skillInputSchema).max(12),
    tools: z.array(z.enum(toolNames)).max(40),
    steps: z
      .array(
        z
          .object({
            id: key,
            title: z.string().trim().min(1).max(100),
            instruction: z.string().trim().min(1).max(1500),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    resources: z
      .array(
        z
          .object({
            type: z.enum(["record", "note", "document"]),
            id: z.uuid(),
            label: z.string().max(100),
          })
          .strict(),
      )
      .max(12),
    dependencies: z.array(z.uuid()).max(5),
    output: z
      .object({
        format: z.enum([
          "brief",
          "table",
          "checklist",
          "report",
          "email",
          "custom",
          "skill_manifest",
        ]),
        requirements: z.array(z.string().trim().min(1).max(300)).max(12),
      })
      .strict(),
    budget: z
      .object({
        tool_calls: z.number().int().min(0).max(15),
        output_tokens: z.number().int().min(500).max(3000),
        duration_seconds: z.number().int().min(5).max(60),
      })
      .strict(),
    examples: z
      .array(
        z
          .object({
            request: z.string().trim().min(1).max(1000),
            expected: z.string().trim().min(1).max(3000),
          })
          .strict(),
      )
      .max(8),
    tests: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(100),
            kind: z.enum(["normal", "missing_input", "ambiguous", "adversarial"]).default("normal"),
            request: z.string().trim().min(1).max(1000),
            expected: z.enum(["answer", "clarify", "reject"]).default("answer"),
            input: z.record(key, inputValue),
            contains: z.array(z.string().trim().min(1).max(200)).max(10),
            excludes: z.array(z.string().trim().min(1).max(200)).max(10),
            min_sources: z.number().int().min(0).max(20),
            forbidden_tools: z.array(z.enum(toolNames)).max(40).default([]),
          })
          .strict(),
      )
      .max(10),
  })
  .strict();
export type SkillManifest = z.infer<typeof skillManifestSchema>;
export type SkillInput = z.infer<typeof skillInputSchema>;
export type SkillValues = Record<string, z.infer<typeof inputValue>>;
export class SkillValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillValidationError";
  }
}
// Inspect raw input before a schema parser can silently discard __proto__.
// Bound traversal as these entry points also accept imported, untrusted JSON.
function assertSafeKeys(value: unknown) {
  const pending: { value: unknown; depth: number; exit?: boolean }[] = [{ value, depth: 0 }];
  const ancestors = new WeakSet<object>();
  let visited = 0;
  while (pending.length) {
    const current = pending.pop()!;
    if (!current.value || typeof current.value !== "object") continue;
    if (current.exit) {
      ancestors.delete(current.value);
      continue;
    }
    if (current.depth > 20 || ancestors.has(current.value))
      throw new SkillValidationError("Structure de skill invalide.");
    ancestors.add(current.value);
    pending.push({ ...current, exit: true });
    const keys = Object.keys(current.value);
    visited += keys.length;
    if (visited > 20000) throw new SkillValidationError("Structure de skill trop volumineuse.");
    for (const name of keys) {
      if (["__proto__", "constructor", "prototype"].includes(name))
        throw new SkillValidationError("Clé interdite dans cette skill.");
      pending.push({
        value: (current.value as Record<string, unknown>)[name],
        depth: current.depth + 1,
      });
    }
  }
}
function skillValidation<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof SkillValidationError) throw error;
    if (error instanceof z.ZodError)
      throw new SkillValidationError(
        error.issues
          .slice(0, 3)
          .map((issue) => (issue.path.length ? issue.path.join(".") + " : " : "") + issue.message)
          .join(" · "),
      );
    if (error instanceof SyntaxError)
      throw new SkillValidationError("Le fichier ne contient pas un manifeste JSON valide.");
    throw new SkillValidationError("Le contenu de cette skill est invalide.");
  }
}

export function parseSkillManifest(value: unknown): SkillManifest {
  return skillValidation(() => {
    assertSafeKeys(value);
    const manifest = skillManifestSchema.parse(value);
    if (
      new Set(manifest.tools).size !== manifest.tools.length ||
      new Set(manifest.inputs.map((v) => v.key)).size !== manifest.inputs.length ||
      new Set(manifest.steps.map((v) => v.id)).size !== manifest.steps.length
    )
      throw new SkillValidationError(
        "Les clés des entrées, étapes et outils doivent être uniques.",
      );
    for (const input of manifest.inputs) {
      if (input.kind === "choice" && !input.options.length)
        throw new SkillValidationError("Un choix nécessite au moins une option.");
      if (input.kind !== "choice" && input.options.length)
        throw new SkillValidationError("Les options sont réservées aux champs de choix.");
      if (input.kind !== "records" && input.min_items !== undefined)
        throw new SkillValidationError(
          "Le nombre minimum de fiches concerne uniquement une sélection multiple.",
        );
      if (new Set(input.options).size !== input.options.length)
        throw new SkillValidationError("Les options de choix doivent être uniques.");
    }
    if (JSON.stringify(manifest).length > 50000)
      throw new SkillValidationError("Cette méthode dépasse la taille autorisée.");
    if (manifest.tools.length && !manifest.budget.tool_calls)
      throw new SkillValidationError(
        "Une méthode avec des outils nécessite un budget d’appels positif.",
      );
    validateSkillValues(
      manifest,
      Object.fromEntries(
        manifest.inputs.filter((i) => i.default !== undefined).map((i) => [i.key, i.default]),
      ),
      true,
    );
    for (const test of manifest.tests) {
      validateSkillValues(manifest, test.input, test.kind !== "normal");
      if (test.kind === "missing_input" && test.expected === "answer")
        throw new SkillValidationError(
          "Un test d’entrée manquante doit attendre une clarification ou un refus.",
        );
    }
    return manifest;
  });
}

export function validateSkillValues(
  manifest: SkillManifest,
  values: unknown,
  allowMissing = false,
): SkillValues {
  return skillValidation(() => {
    assertSafeKeys(values);
    const supplied = z.record(key, inputValue).parse(values);
    const result: SkillValues = Object.create(null);
    for (const name of Object.keys(supplied))
      if (!manifest.inputs.some((input) => input.key === name))
        throw new SkillValidationError(`Paramètre inconnu : ${name}.`);
    for (const field of manifest.inputs) {
      const value = Object.hasOwn(supplied, field.key) ? supplied[field.key] : field.default;
      if (
        value === undefined ||
        value === null ||
        (typeof value === "string" && !value.replace(/[\p{White_Space}\p{Cf}]/gu, ""))
      ) {
        if (field.required && !allowMissing)
          throw new SkillValidationError(`Complétez « ${field.label} ».`);
        continue;
      }
      const valid =
        field.kind === "records"
          ? Array.isArray(value) &&
            value.length >= (field.min_items ?? 1) &&
            value.every((id) => z.uuid().safeParse(id).success) &&
            new Set(value).size === value.length
          : field.kind === "number"
            ? typeof value === "number" && Number.isFinite(value)
            : field.kind === "boolean"
              ? typeof value === "boolean"
              : typeof value === "string" &&
                (field.kind !== "record" || z.uuid().safeParse(value).success) &&
                (field.kind !== "date" || z.iso.date().safeParse(value).success) &&
                (field.kind !== "choice" || field.options.includes(value));
      if (!valid) throw new SkillValidationError(`Valeur invalide pour « ${field.label} ».`);
      result[field.key] = value;
    }
    return result;
  });
}

// A creator result is a draft manifest, never arbitrary prose or an executable
// instruction. Publishing and resource attachment require separate user actions.
export function parseSkillDraftResult(value: unknown): SkillManifest {
  return skillValidation(() => {
    const manifest = parseSkillManifest(value);
    if (!manifest.examples.length || manifest.tests.length < 3)
      throw new SkillValidationError(
        "Le brouillon doit inclure un exemple et au moins trois cas d’évaluation décrits.",
      );
    const kinds = new Set(manifest.tests.map((test) => test.kind));
    if (
      !["normal", "missing_input", "adversarial"].every((kind) =>
        kinds.has(kind as SkillManifest["tests"][number]["kind"]),
      )
    )
      throw new SkillValidationError(
        "Les évaluations doivent couvrir une demande normale, une entrée manquante et une instruction malveillante.",
      );
    if (manifest.resources.length || manifest.dependencies.length)
      throw new SkillValidationError(
        "Ajoutez et autorisez les références du brouillon séparément avant publication.",
      );
    return manifest;
  });
}

export const skillCreatorResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("draft"), manifest: skillManifestSchema }).strict(),
  z
    .object({
      status: z.literal("clarify"),
      questions: z.array(z.string().trim().min(1).max(300)).min(1).max(5),
    })
    .strict(),
  z.object({ status: z.literal("reject"), reason: z.string().trim().min(1).max(1000) }).strict(),
]);
export type SkillCreatorResult = z.infer<typeof skillCreatorResultSchema>;
export function parseSkillCreatorResult(value: unknown): SkillCreatorResult {
  return skillValidation(() => {
    assertSafeKeys(value);
    const result = skillCreatorResultSchema.parse(value);
    return result.status === "draft"
      ? { ...result, manifest: parseSkillDraftResult(result.manifest) }
      : result;
  });
}

export function skillEffects(manifest: Pick<SkillManifest, "tools">) {
  return skillValidation(() => {
    let write = false,
      external = false;
    for (const name of manifest.tools) {
      const flags = toolEffectFlags(name);
      write ||= flags.write;
      external ||= flags.external;
    }
    return { write, external };
  });
}
export const skillPreferencesSchema = z
  .object({ enabled: z.boolean(), auto_select: z.boolean(), favorite: z.boolean() })
  .strict();
export type SkillPreferences = z.infer<typeof skillPreferencesSchema>;
const executionContextSchema = z
  .object({
    canUse: z.boolean(),
    published: z.boolean(),
    preferences: skillPreferencesSchema,
    selection: z.enum(["explicit", "automatic"]),
    userTools: z.array(z.enum(toolNames)).max(40),
    grantedTools: z.array(z.enum(toolNames)).max(40),
    integrationTools: z.array(z.enum(toolNames)).max(40),
    conversationMode: assistantApprovalMode,
  })
  .strict();
export function skillRuntimeLimits(manifest: SkillManifest, serverBudget: SkillManifest["budget"]) {
  return skillValidation(() => {
    const checked = parseSkillManifest(manifest);
    const ceiling = skillManifestSchema.shape.budget.parse(serverBudget);
    return {
      tool_calls: checked.tools.length
        ? Math.min(checked.budget.tool_calls, ceiling.tool_calls)
        : 0,
      output_tokens: Math.min(checked.budget.output_tokens, ceiling.output_tokens),
      duration_seconds: Math.min(checked.budget.duration_seconds, ceiling.duration_seconds),
    };
  });
}
export function skillExecutionPolicy(
  manifest: SkillManifest,
  context: {
    canUse: boolean;
    published: boolean;
    preferences: SkillPreferences;
    selection: "explicit" | "automatic";
    userTools: readonly ToolName[];
    grantedTools: readonly ToolName[];
    integrationTools: readonly ToolName[];
    conversationMode: AssistantApprovalMode;
  },
) {
  return skillValidation(() => {
    const checked = parseSkillManifest(manifest);
    const policy = executionContextSchema.parse(context);
    const preferences = policy.preferences;
    const mode = policy.conversationMode;
    if (
      !policy.canUse ||
      !policy.published ||
      !preferences.enabled ||
      (policy.selection === "automatic" && !preferences.auto_select)
    )
      throw new SkillValidationError("Cette skill n’est pas disponible dans ce contexte.");
    const sets = [policy.userTools, policy.grantedTools, policy.integrationTools].map(
      (names) => new Set(names),
    );
    if (checked.tools.some((name) => sets.some((set) => !set.has(name))))
      throw new SkillValidationError(
        "Les droits ou les intégrations ne permettent pas tous les outils de cette skill.",
      );
    // Auto-selection is routing only. Only the conversation's independently
    // chosen mode determines execution; no preference or manifest can raise it.
    return {
      allowed_tools: [...checked.tools],
      mode,
      execution:
        mode === "auto"
          ? ("delegated" as const)
          : mode === "review"
            ? ("review" as const)
            : ("confirm" as const),
    };
  });
}
export function skillSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
export type SkillSummary = {
  id: string;
  workspace_id: string;
  owner_id: string;
  name: string;
  description: string;
  visibility: "private" | "workspace";
  status: "draft" | "published" | "archived";
  revision: number;
  published_version_id: string | null;
  updated_at: string;
  category: string;
  tags: string[];
  enabled: boolean;
  auto_select: boolean;
  favorite: boolean;
  granted_version_id: string | null;
  granted_tools: ToolName[];
  usage_count: number;
  can_edit: boolean;
  can_publish: boolean;
};
export type SkillVersion = {
  id: string;
  skill_id: string;
  workspace_id: string;
  number: number;
  manifest: SkillManifest;
  content_hash: string;
  created_at: string;
  created_by: string;
};
export type SkillDetail = {
  skill: SkillSummary;
  draft: SkillManifest | null;
  versions: SkillVersion[];
  grants: { user_id: string; permission: "use" | "edit" | "publish" }[];
  runs: SkillRun[];
};
export type SkillRun = {
  id: string;
  skill_id: string;
  version_id: string;
  workspace_id: string;
  user_id: string;
  status:
    | "queued"
    | "running"
    | "waiting_input"
    | "waiting_approval"
    | "completed"
    | "partial"
    | "cancelled"
    | "failed";
  mode: "ask" | "review" | "auto";
  inputs: SkillValues;
  result: unknown;
  created_at: string;
  updated_at: string;
  error_code?: string | null;
  conversation_id?: string | null;
};
export type LoadedSkill = {
  skill: SkillSummary;
  version: SkillVersion;
  inputs: SkillValues;
  allowed_tools: ToolName[];
  instruction: string;
  resources: SkillManifest["resources"];
  run_id?: string;
};

const packageSchema = z
  .object({
    format: z.literal("zyliad.skill"),
    version: z.literal(2),
    manifest: skillManifestSchema,
  })
  .strict();
const packageStart = "<!-- ZYLIAD_MANIFEST_V2\n";
const legacyStart = "<!-- ZYLIAD_MANIFEST_V1\n";
const legacyEnd = "\n-->";
const packageEnd = "\nZYLIAD_MANIFEST_END -->";
export function exportSkillPackage(manifest: SkillManifest) {
  return skillValidation(() =>
    JSON.stringify(
      { format: "zyliad.skill", version: 2, manifest: parseSkillManifest(manifest) },
      null,
      2,
    ),
  );
}
export function exportSkill(manifest: SkillManifest) {
  return skillValidation(() => {
    const checked = parseSkillManifest(manifest);
    // Escape '<' inside the structured payload, so instructions cannot create
    // another real footer marker inside its JSON strings.
    const payload = exportSkillPackage(checked).replaceAll("<", "\\u003c");
    return (
      "---\nname: " +
      JSON.stringify(checked.name) +
      "\ndescription: " +
      JSON.stringify(checked.description) +
      "\n---\n\n" +
      checked.instructions +
      "\n\n" +
      packageStart +
      payload +
      packageEnd +
      "\n"
    );
  });
}
export function importSkill(text: string): SkillManifest {
  return skillValidation(() => {
    if (
      typeof text !== "string" ||
      new TextEncoder().encode(text).length > 256000 ||
      text.includes("\u0000")
    )
      throw new SkillValidationError("Le fichier de skill est invalide ou trop volumineux.");
    const normalized = text
      .replace(/^\uFEFF/, "")
      .replace(/\r\n?/g, "\n")
      .trimEnd();
    const marker = [
      { value: packageStart, index: normalized.lastIndexOf(packageStart) },
      { value: legacyStart, index: normalized.lastIndexOf(legacyStart) },
    ].sort((a, b) => b.index - a.index)[0];
    if (marker.index >= 0) {
      const end =
        marker.value === legacyStart && normalized.endsWith(legacyEnd) ? legacyEnd : packageEnd;
      if (!normalized.endsWith(end))
        throw new SkillValidationError("Le bloc d’export de cette skill est incomplet.");
      const payload: unknown = JSON.parse(
        normalized.slice(marker.index + marker.value.length, -end.length),
      );
      assertSafeKeys(payload);
      return marker.value === packageStart
        ? parseSkillManifest(packageSchema.parse(payload).manifest)
        : parseSkillManifest(payload);
    }
    const payload: unknown = JSON.parse(normalized);
    assertSafeKeys(payload);
    return payload && typeof payload === "object" && Object.hasOwn(payload, "format")
      ? parseSkillManifest(packageSchema.parse(payload).manifest)
      : parseSkillManifest(payload);
  });
}
