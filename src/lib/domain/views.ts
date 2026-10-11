import { z } from "zod";
import { recordFilters } from "./record-filters";
export const viewConfigSchema = z.object({
  filters: recordFilters.optional(),
  pipeline_id: z.union([z.uuid(), z.literal("")]).default(""),
  layout: z.enum(["table", "cards", "kanban"]).optional(),
  search: z.string().max(300).default(""),
  stage: z.string().max(80).default(""),
  owner: z.union([z.uuid(), z.enum(["", "me", "unassigned"])]).default(""),
  sort: z.enum(["updated_at", "created_at", "display_name", "amount"]).default("updated_at"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  minimum: z
    .string()
    .regex(/^$|^\d{1,16}(\.\d{1,2})?$/)
    .default(""),
  columns: z
    .array(
      z
        .string()
        .regex(/^(display_name|email|domain|amount|stage|close_date|attr_[a-z][a-z0-9_]{0,49})$/),
    )
    .min(1)
    .max(100)
    .transform((v) => [...new Set(v)])
    .default(["display_name", "email", "domain", "stage"]),
});
export type ViewConfig = z.infer<typeof viewConfigSchema>;
export function defaultView(deals = false): ViewConfig {
  return {
    pipeline_id: "",
    search: "",
    stage: "",
    owner: "",
    sort: "updated_at",
    direction: "desc",
    minimum: "",
    columns: ["display_name", "email", deals ? "amount" : "domain", "stage"],
  };
}
export function normalizeView(value: unknown, deals = false) {
  const parsed = viewConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultView(deals);
}

export function defaultRecordView(slug: string): ViewConfig {
  const view = defaultView(slug === "deals");
  view.layout = slug === "deals" ? "kanban" : "table";
  if (slug === "companies") view.columns = ["display_name", "domain", "email"];
  if (slug === "people") view.columns = ["display_name", "email"];
  if (slug === "deals") view.columns = ["display_name", "amount", "stage", "close_date"];
  return view;
}
