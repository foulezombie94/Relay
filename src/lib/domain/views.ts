import { z } from "zod";
export const viewConfigSchema = z.object({
  search: z.string().max(300).default(""),
  stage: z.string().max(80).default(""),
  owner: z.union([z.uuid(), z.enum(["", "me", "unassigned"])]).default(""),
  sort: z
    .enum(["updated_at", "created_at", "display_name", "amount"])
    .default("updated_at"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  minimum: z
    .string()
    .regex(/^$|^\d{1,16}(\.\d{1,2})?$/)
    .default(""),
  columns: z
    .array(
      z
        .string()
        .regex(
          /^(display_name|email|domain|amount|stage|close_date|attr_[a-z][a-z0-9_]{0,49})$/,
        ),
    )
    .min(1)
    .max(100)
    .transform((v) => [...new Set(v)])
    .default(["display_name", "email", "domain", "stage"]),
});
export type ViewConfig = z.infer<typeof viewConfigSchema>;
export function defaultView(deals = false): ViewConfig {
  return {
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
