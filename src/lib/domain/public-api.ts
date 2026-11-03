import { z } from "zod";
import { resources } from "./resource-schemas";

export const apiScopes = [
  "records:read",
  "records:write",
  "tasks:read",
  "tasks:write",
  "notes:read",
  "notes:write",
  "webhooks:manage",
] as const;
export const scopeLabels: Record<(typeof apiScopes)[number], string> = {
  "records:read": "Lire les fiches",
  "records:write": "Créer, modifier et supprimer des fiches",
  "tasks:read": "Lire les tâches",
  "tasks:write": "Créer et modifier des tâches",
  "notes:read": "Lire les notes partagées",
  "notes:write": "Créer des notes",
  "webhooks:manage": "Gérer les webhooks",
};
export const webhookEvents = [
  "record.created",
  "record.updated",
  "record.deleted",
  "record.restored",
  "record.purged",
  "task.created",
  "task.updated",
  "task.deleted",
  "note.created",
  "note.updated",
] as const;
export const webhookEventLabels: Record<(typeof webhookEvents)[number], string> = {
  "record.created": "Fiche créée",
  "record.updated": "Fiche modifiée",
  "record.deleted": "Fiche mise à la corbeille",
  "record.restored": "Fiche restaurée",
  "record.purged": "Fiche supprimée définitivement",
  "task.created": "Tâche créée",
  "task.updated": "Tâche modifiée",
  "task.deleted": "Tâche supprimée",
  "note.created": "Note créée",
  "note.updated": "Note modifiée",
};

const recordShape = resources.records.shape;
/** Values accepted by POST/PATCH /records. Archive and object are not writable fields. */
export const recordValues = z
  .object({
    display_name: recordShape.display_name,
    email: recordShape.email,
    domain: recordShape.domain,
    stage: recordShape.stage,
    amount: recordShape.amount,
    currency: recordShape.currency,
    owner_id: recordShape.owner_id,
    close_date: recordShape.close_date,
    pipeline_id: recordShape.pipeline_id,
    probability: recordShape.probability,
    lost_reason: recordShape.lost_reason,
    attributes: recordShape.attributes,
  })
  .strict();
export const createRecordBody = z
  .object({
    object: z.string().regex(/^[a-z][a-z0-9_-]{1,49}$/, "Slug d’objet invalide."),
    values: recordValues,
  })
  .strict();
export const updateRecordBody = z
  .object({
    version: z.number().int().positive().optional(),
    values: recordValues.partial().refine((v) => Object.keys(v).length > 0, "Aucune valeur."),
  })
  .strict();
export const createTaskBody = resources.tasks
  .pick({
    title: true,
    description: true,
    record_id: true,
    owner_id: true,
    due_date: true,
    priority: true,
  })
  .strict();
export const updateTaskBody = resources.tasks
  .pick({ title: true, status: true, due_date: true })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Aucune valeur.");
export const createNoteBody = resources.notes
  .pick({ title: true, content: true, record_id: true })
  .strict();
export const createWebhookBody = z
  .object({
    url: z
      .url()
      .max(2000)
      .refine((value) => value.startsWith("https://"), "URL HTTPS requise."),
    description: z.string().max(300).optional(),
    events: z.array(z.enum(webhookEvents)).min(1).max(webhookEvents.length),
    object_ids: z.array(z.uuid()).max(50).optional(),
  })
  .strict();
export const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});
export const recordListQuery = listQuery.extend({
  object: z.string().regex(/^[a-z][a-z0-9_-]{1,49}$/),
  q: z.string().trim().min(1).max(200).optional(),
  stage: z.string().max(80).optional(),
  owner_id: z.uuid().optional(),
  pipeline_id: z.uuid().optional(),
  email: z.string().max(320).optional(),
  domain: z.string().max(200).optional(),
  updated_after: z.iso.datetime({ offset: true }).optional(),
  archived: z.enum(["true", "false"]).optional(),
});

/** Webhook signature: HMAC-SHA256 of `${timestamp}.${body}` with the endpoint secret. */
export const signatureHeader = "Zyliad-Signature";
