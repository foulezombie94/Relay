import { z } from "zod";
export const recordFilter = z
  .object({
    field: z
      .string()
      .regex(
        /^(display_name|email|domain|stage|amount|probability|close_date|owner_id|pipeline_id|attributes\.[a-z][a-z0-9_]{0,49})$/,
      ),
    operator: z.enum([
      "equals",
      "not_equals",
      "contains",
      "gt",
      "lt",
      "before",
      "after",
      "exists",
      "not_exists",
    ]),
    value: z.string().max(300).optional(),
  })
  .strict()
  .superRefine((filter, ctx) => {
    const numeric = ["amount", "probability"].includes(filter.field);
    const date = filter.field === "close_date";
    const identity = ["owner_id", "pipeline_id"].includes(filter.field);
    let valid = true;
    if (["gt", "lt"].includes(filter.operator))
      valid = numeric && /^-?\d{1,16}(\.\d{1,6})?$/.test(filter.value ?? "");
    if (["before", "after"].includes(filter.operator))
      valid = date && z.iso.date().safeParse(filter.value).success;
    if (filter.operator === "contains") valid = !numeric && !date && !identity;
    if (["equals", "not_equals"].includes(filter.operator))
      valid =
        filter.value !== undefined &&
        (!numeric || /^-?\d{1,16}(\.\d{1,6})?$/.test(filter.value)) &&
        (!date || z.iso.date().safeParse(filter.value).success) &&
        (!identity || z.uuid().safeParse(filter.value).success);
    if (!valid)
      ctx.addIssue({
        code: "custom",
        message: "Opérateur ou valeur incompatible avec le champ.",
        path: ["operator"],
      });
  });
export const recordFilters = z.array(recordFilter).max(20);
