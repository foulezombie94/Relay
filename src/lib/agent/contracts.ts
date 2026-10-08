import { z } from "zod";
import { resources } from "@/lib/api/resources";

export const sourceKinds = [
  "record",
  "note",
  "meeting",
  "email",
  "calendar",
  "task",
  "commitment",
  "document",
  "conflict",
  "list",
  "pipeline",
  "workflow",
] as const;
export const searchInput = z
  .object({
    query: z.string().trim().max(200).optional(),
    record_id: z.uuid().optional(),
    object_id: z.uuid().optional(),
    owner_id: z.uuid().optional(),
    pipeline_id: z.uuid().optional(),
    status: z.string().max(80).optional(),
    stage: z.string().max(80).optional(),
    since: z.iso.datetime({ offset: true }).optional(),
    until: z.iso.datetime({ offset: true }).optional(),
    overdue: z.boolean().optional(),
    cursor: z.uuid().optional(),
    limit: z.number().int().min(1).max(20).default(20),
  })
  .strict();
export const aggregateInput = searchInput
  .omit({ cursor: true, limit: true })
  .extend({
    kind: z.enum(["record", "task", "commitment", "email", "meeting"]),
    group_by: z.enum(["none", "stage", "owner", "pipeline", "status", "month"]).default("none"),
  })
  .strict();
const recordValues = resources.records
  .omit({ archived: true })
  .extend({
    attributes: z
      .record(
        z.string().regex(/^[a-z][a-z0-9_]{0,49}$/),
        z.union([
          z.string().max(10000),
          z.number().finite(),
          z.boolean(),
          z.null(),
          z.array(z.string().max(100)).max(100),
        ]),
      )
      .optional(),
  })
  .strict();
const recordUpdate = recordValues
  .omit({ object_id: true })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Au moins un champ est requis.");
export const emailDraft = z
  .object({
    provider: z.enum(["gmail", "outlook"]),
    record_id: z.uuid().optional(),
    to: z.email().max(320).toLowerCase(),
    subject: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .refine((v) => !/[\r\n]/.test(v)),
    body: z.string().min(1).max(20000),
    reply_to_id: z.uuid().optional(),
  })
  .strict();
const calendar = z
  .object({
    provider: z.enum(["google-calendar", "outlook-calendar"]),
    title: z.string().trim().min(1).max(300),
    body: z.string().max(10000).default(""),
    starts_at: z.iso.datetime({ offset: true }),
    ends_at: z.iso.datetime({ offset: true }),
    record_id: z.uuid().optional(),
  })
  .strict()
  .refine(
    (v) =>
      Date.parse(v.ends_at) > Date.parse(v.starts_at) &&
      Date.parse(v.ends_at) - Date.parse(v.starts_at) <= 86400000,
    "Durée invalide.",
  );
const agentWorkflow = z
  .object({
    object_id: z.uuid(),
    trigger: z
      .object({ type: z.literal("manual") })
      .strict()
      .default({ type: "manual" }),
    condition_mode: z.enum(["all", "any"]).default("all"),
    reenrollment: z.enum(["once", "on_change"]).default("once"),
    conditions: z
      .array(
        z
          .object({
            field: z.enum(["stage", "amount", "display_name", "close_date"]),
            operator: z.enum(["equals", "not_equals", "contains", "gt", "lt", "before", "after"]),
            value: z.string().max(300),
          })
          .strict(),
      )
      .max(20)
      .default([]),
    actions: z
      .array(
        z
          .object({
            type: z.enum(["task", "note", "commitment"]),
            title: z.string().min(1).max(300),
            body: z.string().max(10000).optional(),
            days: z.number().int().min(0).max(365).optional(),
            owner: z.enum(["record", "runner"]).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();
const workflowDraft = z
  .object({
    name: z.string().trim().min(1).max(300),
    description: z.string().max(1000).optional(),
    definition: agentWorkflow,
  })
  .strict();
export const actionSchemas = {
  create_record: recordValues,
  update_record: z
    .object({ id: z.uuid(), version: z.number().int().positive(), values: recordUpdate })
    .strict(),
  create_task: resources.tasks.strict(),
  update_task: z
    .object({
      id: z.uuid(),
      version: z.number().int().positive(),
      values: resources.tasks.omit({ record_id: true }).partial().strict(),
    })
    .strict(),
  create_note: resources.notes.extend({ content: z.string().min(1).max(20000) }).strict(),
  update_note: z
    .object({
      id: z.uuid(),
      version: z.number().int().positive(),
      values: resources.notes.omit({ record_id: true }).partial().strict(),
    })
    .strict(),
  draft_email: emailDraft,
  create_calendar_event: calendar,
  update_calendar_event: calendar.extend({ id: z.uuid() }).strict(),
  cancel_calendar_event: z.object({ id: z.uuid() }).strict(),
  propose_commitment: resources.commitments
    .extend({
      source_type: z.enum(["note", "meeting", "email"]),
      source_id: z.uuid(),
      source_quote: z.string().trim().min(1).max(2000),
    })
    .omit({ status: true })
    .strict(),
  update_commitment: z
    .object({
      id: z.uuid(),
      version: z.number().int().positive(),
      values: resources.commitments
        .pick({ status: true, due_date: true, owner_id: true, evidence: true })
        .partial()
        .strict(),
    })
    .strict(),
  create_workflow_draft: workflowDraft,
  update_workflow_draft: z
    .object({
      id: z.uuid(),
      version: z.number().int().positive(),
      values: workflowDraft.partial().strict(),
    })
    .strict(),
  add_to_list: z.object({ list_id: z.uuid(), record_id: z.uuid() }).strict(),
  remove_from_list: z.object({ list_id: z.uuid(), record_id: z.uuid() }).strict(),
} as const;
export type ActionKind = keyof typeof actionSchemas;
const contentSearch = searchInput.omit({
  object_id: true,
  owner_id: true,
  pipeline_id: true,
  status: true,
  stage: true,
  overdue: true,
});
const taskSearch = searchInput.omit({ object_id: true, pipeline_id: true, stage: true });
export const toolSchemas = {
  search_records: searchInput,
  search_emails: contentSearch,
  search_calendar: contentSearch,
  search_meetings: contentSearch,
  search_notes: contentSearch,
  search_tasks: taskSearch,
  search_commitments: taskSearch,
  search_documents: contentSearch,
  search_conflicts: contentSearch.extend({ status: z.string().max(80).optional() }).strict(),
  search_lists: searchInput.pick({ query: true, cursor: true, limit: true, object_id: true }),
  search_pipelines: searchInput.pick({ query: true, cursor: true, limit: true }),
  search_workflows: searchInput.pick({ query: true, cursor: true, limit: true }),
  get_record: z.object({ id: z.uuid() }).strict(),
  get_source: z
    .object({
      kind: z.enum(sourceKinds),
      id: z.uuid(),
      offset: z.number().int().min(0).max(200000).default(0),
    })
    .strict(),
  get_email_thread: z
    .object({
      id: z.uuid(),
      cursor: z.uuid().optional(),
      limit: z.number().int().min(1).max(20).default(20),
    })
    .strict(),
  get_accounts: z.object({}).strict(),
  get_crm_schema: z.object({}).strict(),
  aggregate_crm_data: aggregateInput,
  ...actionSchemas,
  send_email: z.object({ draft_id: z.uuid() }).strict(),
  get_action_status: z.object({ id: z.uuid() }).strict(),
} as const;
export type ToolName = keyof typeof toolSchemas;
export type AgentAction = {
  id: string;
  kind: ActionKind;
  status:
    | "draft"
    | "pending"
    | "queued"
    | "sending"
    | "sent"
    | "completed"
    | "failed"
    | "uncertain"
    | "cancelled";
  input: Record<string, unknown>;
  result?: Record<string, unknown>;
  created_at?: string;
  error_code?: string;
  private_context?: boolean;
};
export function toolsForModel() {
  return Object.entries(toolSchemas).map(([name, schema]) => ({
    type: "function",
    function: {
      name,
      description: name.startsWith("search_")
        ? "Recherche paginée dans les données autorisées. Utiliser le curseur ; résultats potentiellement partiels. Filtres non applicables refusés."
        : name === "send_email"
          ? "Demander l’envoi d’un brouillon existant. Le serveur contrôle l’autorisation de l’utilisateur ; sinon une confirmation est requise."
          : name in actionSchemas
            ? "Préparer une action durable à examiner. Aucune écriture CRM avant confirmation de l’utilisateur."
            : name === "aggregate_crm_data"
              ? "Calcul exact SQL sur les données autorisées, indépendant des pages ; sommes séparées par devise."
              : "Lire uniquement les données autorisées ; aucun secret.",
      parameters: JSON.parse(
        JSON.stringify(z.toJSONSchema(schema, { io: "input" }), (key, value) =>
          key === "$schema" ||
          (key === "pattern" && typeof value === "string" && value.length > 100)
            ? undefined
            : value,
        ),
      ),
    },
  }));
}

// Authorization is derived only from the CURRENT user message. A source, history,
// or model argument can never grant it. Ambiguous language deliberately needs review.
export function explicitEmailRecipient(message: string): string | null {
  const match =
    /^\s*(?:envoie|envoyer|send)\s+(?:(?:cet|un|l[’'])\s*)?(?:e-?mail|email|message)\s+(?:à|a|to)\s+([A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,})(?=\s|[.,;!?]|$)/i.exec(
      message,
    );
  return match?.[1].toLowerCase() ?? null;
}
export function sensitiveEmail(subject: string, body: string) {
  return /\b(?:password|mot de passe|secret|confidentiel|iban|virement|bank|medical|médical|licenciement|contrat|contract|juridique|legal)\b/i.test(
    subject + "\n" + body,
  );
}
export function explicitContactName(message: string): string | null {
  if (/[\n"«»]/.test(message) || explicitEmailRecipient(message)) return null;
  const m =
    /^\s*(?:envoie|envoyer|send)\s+(?:(?:cet|un)\s+)?(?:e-?mail|email|message)\s+(?:à|a|to)\s+([\p{L}\p{N}][\p{L}\p{N}'’ -]{0,79}?)(?=\s+(?:pour|afin|au sujet)|[.,;!?]|$)/iu.exec(
      message,
    );
  return m?.[1].trim() ?? null;
}
