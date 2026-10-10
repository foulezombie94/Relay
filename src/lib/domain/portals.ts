import { z } from "zod";
export const portalItemTypes = ["update", "step", "decision", "document"] as const;
export const portalTypeLabels = {
  update: "Actualités",
  step: "Étapes",
  decision: "Décisions",
  document: "Documents",
};
export const portalStatusLabels: Record<string, string> = {
  open: "En cours",
  done: "Terminé",
  approved: "Validé",
};
export const portalSummarySchema = z.object({
  id: z.uuid(),
  item_count: z.number().int().nonnegative(),
  step_count: z.number().int().nonnegative(),
  completed_steps: z.number().int().nonnegative(),
  document_count: z.number().int().nonnegative(),
  open_decisions: z.number().int().nonnegative(),
  comment_count: z.number().int().nonnegative(),
  next_due_at: z.string().nullable(),
  last_activity_at: z.string(),
  can_comment: z.boolean(),
});
export type PortalSummary = z.infer<typeof portalSummarySchema>;
export const portalDirectorySchema = z.object({
  data: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        enabled: z.boolean(),
        created_at: z.string(),
        access: z.enum(["team", "client"]),
        can_manage: z.boolean(),
        workspace_id: z.uuid().nullable(),
        summary: portalSummarySchema,
      }),
    )
    .max(24),
  count: z.number().int().nonnegative(),
  page: z.number().int().nonnegative(),
  manage_workspace_id: z.uuid().nullable(),
});
export type PortalDirectory = z.infer<typeof portalDirectorySchema>;
export type PortalCard = PortalDirectory["data"][number];
export const portalItemSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  content: z.string(),
  type: z.enum(portalItemTypes),
  status: z.string(),
  due_date: z.string().nullable(),
  document_id: z.uuid().nullable(),
  created_at: z.string(),
});
export const portalCommentSchema = z.object({
  id: z.uuid(),
  content: z.string(),
  created_at: z.string(),
  own: z.boolean(),
});
export const portalDetailSchema = z.object({
  portal: z.object({ id: z.uuid(), name: z.string() }),
  summary: portalSummarySchema,
  items: z.array(portalItemSchema).max(50),
  comments: z.array(portalCommentSchema).max(25),
  items_count: z.number().int().nonnegative(),
  comments_count: z.number().int().nonnegative(),
  items_page: z.number().int().nonnegative(),
  comments_page: z.number().int().nonnegative(),
  can_comment: z.boolean(),
});
export type PortalDetail = z.infer<typeof portalDetailSchema>;
export type PortalItem = z.infer<typeof portalItemSchema>;
export const portalMessageSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, "Écrivez votre message.")
      .max(5000, "Le message est limité à 5 000 caractères."),
  })
  .strict();
export function portalProgress(summary: Pick<PortalSummary, "step_count" | "completed_steps">) {
  return summary.step_count
    ? Math.min(100, Math.round((summary.completed_steps / summary.step_count) * 100))
    : null;
}
export function portalDate(value: string | null | undefined, withTime = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Sans date";
  return new Date(value).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}
export function portalInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0] ?? "")
      .join("")
      .toUpperCase() || "P"
  );
}
