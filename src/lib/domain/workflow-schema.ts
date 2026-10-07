import { z } from "zod";
export const workflowCondition = z.object({
 field: z.string().regex(/^(stage|amount|probability|email|domain|display_name|close_date|owner_id|pipeline_id|attributes\.[a-zA-Z0-9_-]{1,50})$/),
 operator: z.enum(["equals", "not_equals", "contains", "gt", "lt", "exists", "not_exists", "before", "after"]),
 value: z.union([z.string().max(300), z.number().finite()]).optional(),
}).strict().superRefine((c, ctx) => {
 if (!["exists", "not_exists"].includes(c.operator) && (c.value === undefined || String(c.value).trim() === "")) ctx.addIssue({ code: "custom", message: "La condition attend une valeur." });
 if (["gt", "lt"].includes(c.operator) && !Number.isFinite(Number(c.value))) ctx.addIssue({ code: "custom", message: "La comparaison attend un nombre." });
 if (["before", "after"].includes(c.operator) && !/^\d{4}-\d{2}-\d{2}$/.test(String(c.value))) ctx.addIssue({ code: "custom", message: "Choisissez une date." });
});
const leaf = z.object({
 id: z.uuid().optional(), type: z.enum(["task", "set_field", "email", "note", "commitment", "add_to_list", "delay"]),
 title: z.string().trim().max(300).optional(), field: z.enum(["stage", "owner_id", "close_date", "probability"]).optional(),
 value: z.string().max(300).optional(), body: z.string().max(10000).optional(), days: z.number().int().min(0).max(365).optional(),
 owner: z.enum(["record", "runner", "selected"]).optional(), owner_id: z.uuid().optional(),
 minutes: z.number().int().min(1).max(43200).optional(), list_id: z.uuid().optional(), lost_reason: z.string().trim().max(2000).optional(),
}).strict().superRefine((a, ctx) => {
 const issue = (message: string) => ctx.addIssue({ code: "custom", message });
 if (["task", "commitment", "note"].includes(a.type) && !a.title?.trim()) issue("Donnez un titre à cette action.");
 if (a.type === "note" && !a.body?.trim()) issue("Écrivez le contenu de la note.");
 if (a.owner === "selected" && !a.owner_id) issue("Choisissez un responsable.");
 if (a.type === "delay" && !a.minutes) issue("Choisissez la durée du délai.");
 if (a.type === "add_to_list" && !a.list_id) issue("Choisissez une liste.");
 if (a.type === "set_field") {
  if (!a.field || a.value === undefined) issue("Configurez l’information à modifier.");
  if (a.field === "owner_id" && a.value && !z.uuid().safeParse(a.value).success) issue("Responsable invalide.");
  if (a.field === "close_date" && a.value && !/^\d{4}-\d{2}-\d{2}$/.test(a.value)) issue("Date invalide.");
  if (a.field === "stage" && !a.value?.trim()) issue("Choisissez une étape.");
  if (a.field === "stage" && a.value === "Perdu" && !a.lost_reason) issue("Précisez la raison de perte.");
  if (a.field === "probability" && (!a.value?.trim() || !Number.isFinite(Number(a.value)) || Number(a.value)<0 || Number(a.value)>100)) issue("La probabilité doit être comprise entre 0 et 100.");
 }
});
const branch = z.object({ id: z.uuid().optional(), type: z.literal("branch"), conditions: z.array(workflowCondition).min(1).max(20), condition_mode: z.enum(["all", "any"]).optional(), then: z.array(leaf).max(10), otherwise: z.array(leaf).max(10) }).strict();
export const workflowDefinition = z.object({
 object_id: z.uuid(), conditions: z.array(workflowCondition).max(20), actions: z.array(z.union([leaf, branch])).min(1).max(20),
 condition_mode: z.enum(["all", "any"]).optional(),
 trigger: z.object({ type: z.enum(["manual", "record_created", "record_updated", "stage_changed"]), field: workflowCondition.shape.field.optional() }).strict().optional(),
 reenrollment: z.enum(["once", "on_change"]).optional(),
}).strict().superRefine((d, ctx) => {
 const count = d.actions.reduce((n, a) => n+(a.type==="branch"?1+a.then.length+a.otherwise.length:1), 0);
 if (count>40) ctx.addIssue({ code: "custom", message: "40 blocs maximum, branches comprises." });
 if (d.actions.every(a=>a.type==="delay")) ctx.addIssue({ code: "custom", message: "Ajoutez au moins une action utile." });
});
