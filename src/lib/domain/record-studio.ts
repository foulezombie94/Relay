import { z } from "zod";
const field = z
  .string()
  .regex(
    /^(display_name|email|domain|stage|amount|currency|close_date|owner_id|attr_[a-z][a-z0-9_]{0,49})$/,
  );
const name = z.string().trim().min(1).max(160);
export const studioKinds = ["layout", "relation", "rollup", "button", "template", "form"] as const;
export type StudioKind = (typeof studioKinds)[number];
export const studioLabels: Record<StudioKind, string> = {
  layout: "Disposition",
  relation: "Relations",
  rollup: "Calculs",
  button: "Boutons",
  template: "Modèles",
  form: "Formulaires",
};
export const layoutSpec = z
  .object({
    pinned: z.array(field).max(15),
    groups: z
      .array(z.object({ id: z.string().max(60), title: name, fields: z.array(field).max(100) }))
      .max(12),
    sections: z
      .array(
        z.enum([
          "overview",
          "relations",
          "timeline",
          "notes",
          "tasks",
          "commitments",
          "activities",
          "documents",
          "contacts",
          "deals",
        ]),
      )
      .min(1)
      .max(10),
    details: z.boolean().default(true),
  })
  .strict();
export const relationSpec = z
  .object({
    target_object_id: z.uuid(),
    inverse: z.boolean().default(true),
    inverse_name: name,
    multiple: z.boolean().default(true),
    inverse_multiple: z.boolean().default(true),
  })
  .strict();
export const rollupSpec = z
  .object({
    relation_id: z.uuid(),
    relation_side: z.enum(["source", "target"]).default("source"),
    calculation: z.enum(["count", "sum_amount", "next_due"]),
  })
  .strict();
export const buttonSpec = z
  .object({
    workflow_id: z.uuid(),
    confirmation: z.string().max(500).default("Vérifiez l’aperçu avant de confirmer."),
  })
  .strict();
export const templateValues = z
  .object({
    display_name: z.string().trim().max(200).optional(),
    email: z
      .union([z.email().max(320), z.literal("")])
      .nullable()
      .optional(),
    domain: z.string().max(200).nullable().optional(),
    stage: z.string().max(80).optional(),
    amount: z.number().finite().nonnegative().max(9999999999999999).optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    owner_id: z.uuid().nullable().optional(),
    close_date: z.iso.date().nullable().optional(),
    attributes: z.record(z.string().max(50), z.unknown()).optional(),
  })
  .strict();
export const templateSpec = z
  .object({
    values: templateValues,
    content: z.string().max(10000).default(""),
    checklist: z.array(z.string().trim().min(1).max(300)).max(40).default([]),
    repeat: z.enum(["none", "daily", "weekly", "monthly"]).default("none"),
    repeat_start: z.iso.datetime({ offset: true }).nullable().default(null),
    timezone: z.string().max(100).default("Europe/Paris"),
  })
  .strict()
  .superRefine((spec, ctx) => {
    if (spec.repeat !== "none" && !spec.repeat_start)
      ctx.addIssue({
        code: "custom",
        message: "Choisissez une date et une heure pour la récurrence.",
      });
    try {
      new Intl.DateTimeFormat("fr", { timeZone: spec.timezone });
    } catch {
      ctx.addIssue({ code: "custom", message: "Fuseau horaire invalide." });
    }
  });
export const formQuestion = z
  .object({
    id: z.uuid(),
    property: field,
    label: name,
    description: z.string().max(500).default(""),
    type: z.enum(["text", "textarea", "email", "url", "number", "date", "select", "checkbox"]),
    required: z.boolean().default(false),
    options: z.array(z.string().max(100)).max(100).default([]),
    show_if: z
      .object({ question_id: z.uuid(), value: z.string().max(300) })
      .nullable()
      .default(null),
  })
  .strict();
export const formSpec = z
  .object({
    description: z.string().max(2000).default(""),
    questions: z.array(formQuestion).min(1).max(40),
    published: z.boolean().default(false),
    submit_label: name.default("Envoyer"),
    success_message: name.default("Merci, votre réponse a été enregistrée."),
  })
  .strict()
  .superRefine((spec, ctx) => {
    const seen = new Set<string>(),
      properties = new Set<string>();
    for (const q of spec.questions) {
      if (seen.has(q.id) || properties.has(q.property))
        ctx.addIssue({
          code: "custom",
          message: "Chaque question et propriété doivent être uniques.",
        });
      if (q.show_if && !seen.has(q.show_if.question_id))
        ctx.addIssue({
          code: "custom",
          message: "Une condition doit utiliser une question précédente.",
        });
      if (["stage", "owner_id", "currency"].includes(q.property))
        ctx.addIssue({
          code: "custom",
          message: "Ce champ interne ne peut pas être exposé dans un formulaire.",
        });
      seen.add(q.id);
      properties.add(q.property);
    }
    if (!spec.questions.some((q) => q.property === "display_name" && q.required && !q.show_if))
      ctx.addIssue({
        code: "custom",
        message: "Le nom doit être obligatoire et toujours visible.",
      });
  });
const base = { object_id: z.uuid(), name };
export const studioInput = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("layout"), config: layoutSpec }),
  z.object({ ...base, kind: z.literal("relation"), config: relationSpec }),
  z.object({ ...base, kind: z.literal("rollup"), config: rollupSpec }),
  z.object({ ...base, kind: z.literal("button"), config: buttonSpec }),
  z.object({ ...base, kind: z.literal("template"), config: templateSpec }),
  z.object({ ...base, kind: z.literal("form"), config: formSpec }),
]);
export type StudioInput = z.infer<typeof studioInput>;
export type StudioConfig = StudioInput & {
  id: string;
  workspace_id: string;
  version: number;
  share_key: string;
  created_by: string;
  created_at: string;
};
export const studioRow = studioInput.and(
  z.object({
    id: z.uuid(),
    workspace_id: z.uuid(),
    version: z.number().int().positive(),
    share_key: z.uuid(),
    created_by: z.uuid(),
    created_at: z.string(),
  }),
);
export const defaultLayout = layoutSpec.parse({
  pinned: ["email", "domain"],
  groups: [{ id: "properties", title: "Propriétés", fields: ["email", "domain", "owner_id"] }],
  sections: [
    "overview",
    "relations",
    "timeline",
    "notes",
    "tasks",
    "commitments",
    "activities",
    "documents",
  ],
  details: true,
});
export function visibleFormQuestions(
  spec: z.infer<typeof formSpec>,
  values: Record<string, unknown>,
) {
  const visible = new Set<string>();
  return spec.questions.filter((q) => {
    const show =
      !q.show_if ||
      (visible.has(q.show_if.question_id) &&
        String(values[q.show_if.question_id] ?? "") === q.show_if.value);
    if (show) visible.add(q.id);
    return show;
  });
}
export function templateContent(spec: z.infer<typeof templateSpec>) {
  return [spec.content, ...spec.checklist.map((item) => "☐ " + item)].filter(Boolean).join("\n");
}
