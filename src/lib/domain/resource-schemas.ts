import { z } from "zod";
import { meetingSchema, insightTemplateSchema } from "./meetings";
import { dashboardSchema } from "@/lib/domain/dashboards";
import { pipelineSchema } from "@/lib/domain/pipelines";
import { emailTemplateSchema } from "@/lib/domain/email-templates";
import { viewConfigSchema } from "@/lib/domain/views";
const id = z.uuid(),
  optionalId = id.nullable().optional();
const text = z.string().trim().min(1).max(300);
export { workflowDefinition } from "@/lib/domain/workflow-schema";
import { workflowDefinition } from "@/lib/domain/workflow-schema";
export const resources = {
  report_dashboards: dashboardSchema,
  pipelines: pipelineSchema,
  email_templates: emailTemplateSchema,
  records: z.object({
    object_id: id,
    display_name: text.max(200),
    email: z
      .union([
        z
          .string()
          .trim()
          .pipe(z.email({ error: "Adresse email invalide" })),
        z.string().trim().pipe(z.literal("")),
      ])
      .nullable()
      .optional(),
    domain: z.string().trim().max(200).nullable().optional(),
    stage: z.string().max(80).optional(),
    amount: z
      .union([
        z.string().regex(/^\d{1,16}(\.\d{1,2})?$/),
        z.number().nonnegative().max(9999999999999999),
      ])
      .optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    owner_id: optionalId,
    close_date: z.iso.date().nullable().optional(),
    pipeline_id: optionalId,
    probability: z.number().min(0).max(100).nullable().optional(),
    lost_reason: z.string().trim().max(2000).nullable().optional(),
    attributes: z
      .record(z.string().max(50), z.unknown())
      .transform((values) =>
        Object.fromEntries(
          Object.entries(values).map(([key, value]) => [
            key,
            typeof value === "string" ? value.trim() : value,
          ]),
        ),
      )
      .optional(),
    archived: z.boolean().optional(),
  }),
  objects: z.object({
    name: text,
    slug: z.string().regex(/^[a-z][a-z0-9_-]{1,49}$/),
    icon: z.string().max(30).optional(),
  }),
  attributes: z.object({
    object_id: id,
    key: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/),
    name: text,
    type: z.enum([
      "text",
      "number",
      "money",
      "date",
      "datetime",
      "boolean",
      "select",
      "multi_select",
      "email",
      "phone",
      "url",
      "location",
      "user",
      "relation",
      "formula",
    ]),
    required: z.boolean().optional(),
    options: z.array(z.string().max(100)).max(100).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    archived: z.boolean().optional(),
  }),
  tasks: z.object({
    title: text,
    description: z.string().max(10000).optional(),
    record_id: optionalId,
    owner_id: optionalId,
    due_date: z.iso.datetime({ offset: true }).nullable().optional(),
    status: z.enum(["open", "in_progress", "done", "cancelled"]).optional(),
    priority: z.enum(["low", "normal", "high"]).optional(),
  }),
  notes: z.object({
    title: z.string().max(300).optional(),
    content: z
      .string()
      .min(1)
      .max(100000)
      .refine((value) => !!value.trim(), "Contenu requis"),
    record_id: optionalId,
    private: z.boolean().optional(),
  }),
  activities: z.object({
    record_id: optionalId,
    type: z.enum(["call", "meeting", "note", "email", "comment"]),
    content: z
      .string()
      .min(1)
      .max(20000)
      .refine((value) => !!value.trim(), "Contenu requis"),
  }),
  commitments: z.object({
    title: text,
    record_id: optionalId,
    owner_id: optionalId,
    due_date: z.iso.datetime({ offset: true }).nullable().optional(),
    status: z
      .enum(["proposed", "confirmed", "in_progress", "done", "postponed", "cancelled"])
      .optional(),
    source_type: z.enum(["manual", "note", "meeting", "email"]).optional(),
    source_id: optionalId,
    source_quote: z.string().max(5000).optional(),
    evidence: z.string().max(10000).optional(),
    uncertainty: z.string().max(2000).optional(),
  }),
  conflicts: z.object({
    title: text,
    record_id: optionalId,
    field: z.string().max(100),
    source_a: z.object({
      label: text,
      quote: z.string().max(5000),
      value: z.string().max(2000),
    }),
    source_b: z.object({
      label: text,
      quote: z.string().max(5000),
      value: z.string().max(2000),
    }),
    status: z.enum(["open", "resolved", "dismissed"]).optional(),
    resolution: z.string().max(10000).optional(),
  }),
  handovers: z.object({
    record_id: id,
    title: text,
    status: z.enum(["draft", "approved", "completed"]).optional(),
    scope: z.string().max(20000).optional(),
    exclusions: z.string().max(20000).optional(),
    milestones: z
      .array(
        z.object({
          title: text,
          date: z.string().optional(),
          done: z.boolean().optional(),
        }),
      )
      .max(100)
      .optional(),
    owner_id: optionalId,
  }),
  workflows: z.object({
    name: text,
    definition: workflowDefinition,
    description: z.string().trim().max(1000).optional(),
  }),
  suppressions: z.object({
    email: z
      .string()
      .trim()
      .pipe(z.email({ error: "Adresse email requise ou invalide" }))
      .transform((value) => value.toLowerCase()),
    reason: z.string().trim().min(1).max(300),
  }),
  sequences: z.object({
    name: text,
    steps: z
      .array(
        z.object({
          subject: text,
          body: z.string().min(1).max(20000),
          delay_days: z.number().int().min(0).max(365),
        }),
      )
      .min(1)
      .max(30),
    timezone: z.string().max(80).optional(),
    enabled: z.boolean().optional(),
  }),
  portals: z.object({
    record_id: id,
    name: text,
    enabled: z.boolean().optional(),
  }),
  portal_members: z.object({
    portal_id: id,
    email: z
      .string()
      .trim()
      .pipe(z.email({ error: "Adresse email requise ou invalide" }))
      .transform((value) => value.toLowerCase()),
    can_comment: z.boolean().optional(),
    revoked: z.boolean().optional(),
    expires_at: z.iso.datetime({ offset: true }).nullable().optional(),
  }),
  portal_items: z.object({
    portal_id: id,
    title: text,
    content: z.string().max(20000).optional(),
    type: z.enum(["update", "step", "decision", "document"]).optional(),
    status: z.enum(["open", "done", "approved"]).optional(),
    due_date: z.iso.datetime({ offset: true }).nullable().optional(),
    document_id: optionalId,
  }),
  lists: z.object({
    object_id: id,
    name: text,
    visibility: z.enum(["workspace", "private"]).optional(),
  }),
  list_entries: z.object({
    list_id: id,
    record_id: id,
    attributes: z.record(z.string(), z.unknown()).optional(),
  }),
  views: z.object({
    object_id: id,
    name: text,
    type: z.enum(["table", "kanban"]).optional(),
    config: viewConfigSchema.optional(),
  }),
  record_relations: z.object({ source_id: id, target_id: id, label: text }),
  meetings: meetingSchema,
  meeting_insight_templates: insightTemplateSchema,
};
export type Resource = keyof typeof resources;
export const readResources = [
  ...Object.keys(resources),
  "memberships",
  "import_jobs",
  "documents",
  "audit_events",
  "workflow_runs",
  "integrations",
  "ai_conversations",
  "portal_comments",
  "enrollments",
  "communications",
  "sequence_deliveries",
  "merge_history",
  "duplicate_decisions",
] as const;
export function isResource(name: string): name is Resource {
  return Object.hasOwn(resources, name);
}
