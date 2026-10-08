import { z } from "zod";
export const reportTile = z
  .object({
    title: z.string().trim().min(1).max(100),
    kind: z.enum(["record", "task", "commitment", "email", "meeting"]),
    group_by: z.enum(["none", "stage", "owner", "pipeline", "status", "month"]),
    metric: z.enum(["count", "amount", "average_amount"]),
    object_id: z.uuid().optional(),
    pipeline_id: z.uuid().optional(),
    owner_id: z.uuid().optional(),
    stage: z.string().max(80).optional(),
    since: z.iso.datetime({ offset: true }).optional(),
    until: z.iso.datetime({ offset: true }).optional(),
    overdue: z.boolean().optional(),
    visual: z.enum(["table", "bars"]).default("table"),
  })
  .strict();
export const dashboardSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    visibility: z.enum(["private", "workspace"]).default("private"),
    config: z.array(reportTile).min(1).max(12),
  })
  .strict();
export type ReportTile = z.infer<typeof reportTile>;
