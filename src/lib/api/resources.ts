import { z } from "zod";
import { viewConfigSchema } from "@/lib/domain/views";
const id = z.uuid(),
  optionalId = id.nullable().optional();
const text = z.string().trim().min(1).max(300);
const condition = z.object({
  field: z.string().max(100),
  operator: z.enum(["equals", "contains", "gt", "lt", "exists"]),
  value: z.union([z.string().max(300), z.number()]).optional(),
});
const action = z.object({
  type: z.enum(["task", "set_field", "email"]),
  title: z.string().max(300).optional(),
  field: z.enum(["stage", "owner_id", "close_date"]).optional(),
  value: z.string().max(300).optional(),
  body: z.string().max(10000).optional(),
  days: z.number().int().min(0).max(365).optional(),
});
export const workflowDefinition = z.object({
  object_id: id,
  conditions: z.array(condition).max(20),
  actions: z.array(action).min(1).max(20),
});
export const resources = {
  records: z.object({
    object_id: id,
    display_name: text,
    email: z
      .union([z.email(), z.literal("")])
      .nullable()
      .optional(),
    domain: z.string().max(200).nullable().optional(),
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
    close_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    attributes: z.record(z.string().max(50), z.unknown()).optional(),
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
    content: z.string().min(1).max(100000),
    record_id: optionalId,
    private: z.boolean().optional(),
  }),
  activities: z.object({
    record_id: optionalId,
    type: z.enum(["call", "meeting", "note", "email", "comment"]),
    content: z.string().min(1).max(20000),
  }),
  commitments: z.object({
    title: text,
    record_id: optionalId,
    owner_id: optionalId,
    due_date: z.iso.datetime({ offset: true }).nullable().optional(),
    status: z
      .enum([
        "proposed",
        "confirmed",
        "in_progress",
        "done",
        "postponed",
        "cancelled",
      ])
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
    enabled: z.boolean().optional(),
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
    enabled: z.literal(false).optional(),
  }),
  portals: z.object({
    record_id: id,
    name: text,
    enabled: z.boolean().optional(),
  }),
  portal_members: z.object({
    portal_id: id,
    email: z.email().toLowerCase(),
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
  meetings: z.object({
    record_id: optionalId,
    title: text,
    starts_at: z.iso.datetime({ offset: true }).nullable().optional(),
    transcript: z.string().max(200000).optional(),
    summary: z.string().max(20000).optional(),
    provider: z.literal("import").optional(),
  }),
};
export type Resource = keyof typeof resources;
export const readResources = [
  ...Object.keys(resources),
  "memberships",
  "documents",
  "audit_events",
  "workflow_runs",
  "integrations",
  "ai_conversations",
  "portal_comments",
  "enrollments",
  "communications",
  "merge_history",
  "duplicate_decisions",
] as const;
export function isResource(name: string): name is Resource {
  return name in resources;
}
