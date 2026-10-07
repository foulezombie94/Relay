import { z } from "zod";
export const workflowCondition = z
  .object({
    field: z
      .string()
      .regex(
        /^(stage|amount|probability|email|domain|display_name|close_date|owner_id|pipeline_id|attributes\.[a-zA-Z0-9_-]{1,50}|steps\.[a-z][a-z0-9_]{0,39}\.(intent|summary|next_action|confidence|provider_id|status|entity_id)|event\.(subject|body|kind))$/,
      ),
    operator: z.enum([
      "equals",
      "not_equals",
      "contains",
      "gt",
      "lt",
      "exists",
      "not_exists",
      "before",
      "after",
    ]),
    value: z.union([z.string().max(300), z.number().finite()]).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (
      !["exists", "not_exists"].includes(c.operator) &&
      (c.value === undefined || String(c.value).trim() === "")
    )
      ctx.addIssue({ code: "custom", message: "La condition attend une valeur." });
    if (["gt", "lt"].includes(c.operator) && !Number.isFinite(Number(c.value)))
      ctx.addIssue({ code: "custom", message: "La comparaison attend un nombre." });
    if (["before", "after"].includes(c.operator) && !/^\d{4}-\d{2}-\d{2}$/.test(String(c.value)))
      ctx.addIssue({ code: "custom", message: "Choisissez une date." });
  });
const leaf = z
  .object({
    id: z.uuid().optional(),
    type: z.enum([
      "task",
      "set_field",
      "email",
      "note",
      "commitment",
      "add_to_list",
      "delay",
      "calendar",
      "slack",
      "webhook",
      "ai",
      "wait_until",
      "notify",
    ]),
    title: z.string().trim().max(300).optional(),
    field: z.enum(["stage", "owner_id", "close_date", "probability"]).optional(),
    value: z.string().max(300).optional(),
    body: z.string().max(10000).optional(),
    days: z.number().int().min(0).max(365).optional(),
    owner: z.enum(["record", "runner", "selected"]).optional(),
    owner_id: z.uuid().optional(),
    minutes: z.number().int().min(1).max(43200).optional(),
    list_id: z.uuid().optional(),
    lost_reason: z.string().trim().max(2000).optional(),
    alias: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,39}$/)
      .optional(),
    provider: z.enum(["gmail", "outlook", "google-calendar", "outlook-calendar"]).optional(),
    to: z.string().max(300).optional(),
    subject: z.string().max(300).optional(),
    destination_id: z.uuid().optional(),
    starts_at: z.string().max(200).optional(),
    duration_minutes: z.number().int().min(5).max(1440).optional(),
    instruction: z.string().trim().max(2000).optional(),
    input: z.string().max(6000).optional(),
    wait_mode: z.enum(["date", "condition", "email_reply"]).optional(),
    until: z.string().max(200).optional(),
    timeout_minutes: z.number().int().min(1).max(43200).optional(),
    timeout_behavior: z.enum(["continue", "stop"]).optional(),
    conditions: z.array(workflowCondition).max(20).optional(),
    condition_mode: z.enum(["all", "any"]).optional(),
  })
  .strict()
  .superRefine((a, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (["task", "commitment", "note"].includes(a.type) && !a.title?.trim())
      issue("Donnez un titre à cette action.");
    if (a.type === "note" && !a.body?.trim()) issue("Écrivez le contenu de la note.");
    if (a.owner === "selected" && !a.owner_id) issue("Choisissez un responsable.");
    if (a.type === "delay" && !a.minutes) issue("Choisissez la durée du délai.");
    if (a.type === "add_to_list" && !a.list_id) issue("Choisissez une liste.");
    if (a.type === "email") {
      if (!["gmail", "outlook"].includes(a.provider ?? "")) issue("Choisissez Gmail ou Outlook.");
      if (!a.to || !a.subject || !a.body)
        issue("Renseignez le destinataire, l’objet et le message.");
      if (a.to && !a.to.includes("{{") && !z.email().safeParse(a.to).success)
        issue("Destinataire invalide.");
    }
    if (
      a.type === "calendar" &&
      (!a.title ||
        !a.starts_at ||
        !["google-calendar", "outlook-calendar"].includes(a.provider ?? ""))
    )
      issue("Choisissez le calendrier, le titre et la date.");
    if (["slack", "webhook"].includes(a.type) && (!a.destination_id || !a.body))
      issue("Choisissez une destination et un contenu.");
    if (a.type === "webhook" && a.body) {
      try {
        JSON.parse(a.body);
      } catch {
        issue(
          "Le corps du webhook doit être un objet JSON valide ; les variables vont dans les valeurs texte.",
        );
      }
    }
    if (a.type === "ai" && (!a.instruction || !a.input || !a.alias))
      issue("Définissez les instructions, le texte source et le nom de sortie.");
    if (a.type === "wait_until") {
      if (!a.wait_mode || !a.timeout_minutes) issue("Choisissez une attente et un délai maximal.");
      if (a.wait_mode === "date" && !a.until) issue("Choisissez la date attendue.");
      if (a.wait_mode === "condition" && !a.conditions?.length)
        issue("Ajoutez une condition attendue.");
    }
    if (a.type === "notify" && !a.title) issue("Renseignez le message de notification.");
    if (a.type === "set_field" && !a.value?.includes("{{")) {
      if (!a.field || a.value === undefined) issue("Configurez l’information à modifier.");
      if (a.field === "owner_id" && a.value && !z.uuid().safeParse(a.value).success)
        issue("Responsable invalide.");
      if (a.field === "close_date" && a.value && !/^\d{4}-\d{2}-\d{2}$/.test(a.value))
        issue("Date invalide.");
      if (a.field === "stage" && !a.value?.trim()) issue("Choisissez une étape.");
      if (a.field === "stage" && a.value === "Perdu" && !a.lost_reason)
        issue("Précisez la raison de perte.");
      if (
        a.field === "probability" &&
        (!a.value?.trim() ||
          !Number.isFinite(Number(a.value)) ||
          Number(a.value) < 0 ||
          Number(a.value) > 100)
      )
        issue("La probabilité doit être comprise entre 0 et 100.");
    }
  });
const branch = z
  .object({
    id: z.uuid().optional(),
    type: z.literal("branch"),
    conditions: z.array(workflowCondition).min(1).max(20),
    condition_mode: z.enum(["all", "any"]).optional(),
    then: z.array(leaf).max(10),
    otherwise: z.array(leaf).max(10),
  })
  .strict();
export const workflowDefinition = z
  .object({
    object_id: z.uuid(),
    conditions: z.array(workflowCondition).max(20),
    actions: z
      .array(z.union([leaf, branch]))
      .min(1)
      .max(20),
    condition_mode: z.enum(["all", "any"]).optional(),
    trigger: z
      .object({
        type: z.enum([
          "manual",
          "record_created",
          "record_updated",
          "stage_changed",
          "email_received",
          "email_replied",
          "task_completed",
          "commitment_overdue",
          "date_reached",
          "meeting_completed",
          "form_received",
          "webhook",
          "schedule",
        ]),
        field: workflowCondition.shape.field.optional(),
        frequency: z.enum(["daily", "weekly"]).optional(),
        time: z
          .string()
          .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
          .optional(),
        timezone: z
          .string()
          .max(100)
          .refine((v) => {
            try {
              new Intl.DateTimeFormat("en", { timeZone: v });
              return true;
            } catch {
              return false;
            }
          }, "Fuseau horaire invalide.")
          .optional(),
        weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
      })
      .strict()
      .optional(),
    reenrollment: z.enum(["once", "on_change"]).optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (
      d.trigger?.type === "schedule" &&
      (!d.trigger.frequency ||
        !d.trigger.time ||
        !d.trigger.timezone ||
        (d.trigger.frequency === "weekly" && !d.trigger.weekdays?.length))
    )
      ctx.addIssue({
        code: "custom",
        message: "Configurez la fréquence, l’heure et le fuseau de la planification.",
      });
    if (
      d.trigger?.type === "date_reached" &&
      !/^(close_date|attributes\.[a-zA-Z0-9_-]{1,50})$/.test(d.trigger.field ?? "")
    )
      ctx.addIssue({ code: "custom", message: "Choisissez la date surveillée." });
    if (d.conditions.some((c) => c.field.startsWith("steps.")))
      ctx.addIssue({
        code: "custom",
        message: "Les sorties des blocs ne sont disponibles qu’après leur exécution.",
      });
    const aliases = d.actions
      .flatMap((a) => (a.type === "branch" ? [...a.then, ...a.otherwise] : [a]))
      .flatMap((a) => (a.alias ? [a.alias] : []));
    if (new Set(aliases).size !== aliases.length)
      ctx.addIssue({ code: "custom", message: "Les noms de sortie doivent être uniques." });
    const count = d.actions.reduce(
      (n, a) => n + (a.type === "branch" ? 1 + a.then.length + a.otherwise.length : 1),
      0,
    );
    if (count > 40)
      ctx.addIssue({ code: "custom", message: "40 blocs maximum, branches comprises." });
    if (d.actions.every((a) => a.type === "delay"))
      ctx.addIssue({ code: "custom", message: "Ajoutez au moins une action utile." });
  });
