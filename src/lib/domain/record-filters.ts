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
export type RecordFilter = z.infer<typeof recordFilter>;

/** A nested AND/OR group. Legacy saved views keep the flat `filters` list (implicit AND). */
export type FilterGroup = { mode: "and" | "or"; items: (RecordFilter | FilterGroup)[] };
export const maxFilterDepth = 3;
export const maxFilterConditions = 30;
const filterGroupShape: z.ZodType<FilterGroup> = z.lazy(() =>
  z
    .object({
      mode: z.enum(["and", "or"]),
      items: z.array(z.union([recordFilter, filterGroupShape])).max(20),
    })
    .strict(),
);
export function isFilterGroup(item: RecordFilter | FilterGroup): item is FilterGroup {
  return "mode" in item && Array.isArray((item as FilterGroup).items);
}
function measure(group: FilterGroup, depth = 1): { depth: number; conditions: number } {
  let deepest = depth;
  let conditions = 0;
  for (const item of group.items) {
    if (isFilterGroup(item)) {
      const inner = measure(item, depth + 1);
      deepest = Math.max(deepest, inner.depth);
      conditions += inner.conditions;
    } else conditions++;
  }
  return { depth: deepest, conditions };
}
export const filterTree = filterGroupShape.superRefine((group, ctx) => {
  const size = measure(group);
  if (size.depth > maxFilterDepth)
    ctx.addIssue({ code: "custom", message: `Au plus ${maxFilterDepth} niveaux de groupes.` });
  if (size.conditions > maxFilterConditions)
    ctx.addIssue({ code: "custom", message: `Au plus ${maxFilterConditions} conditions.` });
});
export function filterCount(group?: FilterGroup | null) {
  return group ? measure(group).conditions : 0;
}
/** Removes empty groups so the tree sent to the server only holds real conditions. */
export function pruneFilterTree(group: FilterGroup): FilterGroup | null {
  const items = group.items
    .map((item) => (isFilterGroup(item) ? pruneFilterTree(item) : item))
    .filter((item): item is RecordFilter | FilterGroup => item !== null);
  return items.length ? { mode: group.mode, items } : null;
}

// PostgREST logic-tree serialization. Every value is double-quoted with
// backslash escaping, so commas, dots, parentheses and quotes stay literal.
const quote = (value: string) => '"' + value.replace(/[\\"]/g, "\\$&") + '"';
function filterColumn(field: string) {
  return field.startsWith("attributes.") ? "attributes->>" + field.slice(11) : field;
}
export function conditionToLogic(filter: RecordFilter) {
  const column = filterColumn(filter.field);
  if (filter.operator === "exists") return `${column}.not.is.null`;
  if (filter.operator === "not_exists") return `${column}.is.null`;
  const value = filter.value ?? "";
  switch (filter.operator) {
    case "equals":
      return `${column}.eq.${quote(value)}`;
    case "not_equals":
      return `${column}.neq.${quote(value)}`;
    case "contains":
      // LIKE metacharacters are escaped; "*" stays PostgREST's wildcard.
      return `${column}.ilike.${quote("*" + value.replace(/[\\%_]/g, "\\$&") + "*")}`;
    case "gt":
    case "after":
      return `${column}.gt.${quote(value)}`;
    case "lt":
    case "before":
      return `${column}.lt.${quote(value)}`;
  }
}
export function groupToLogic(group: FilterGroup): string {
  return `${group.mode}(${group.items
    .map((item) => (isFilterGroup(item) ? groupToLogic(item) : conditionToLogic(item)))
    .join(",")})`;
}
/** Keeps only complete, valid conditions: a half-typed value never reaches the server. */
export function sendableFilterTree(group?: FilterGroup | null): FilterGroup | null {
  if (!group) return null;
  const items = group.items
    .map((item) =>
      isFilterGroup(item)
        ? sendableFilterTree(item)
        : recordFilter.safeParse(item).success && (item.operator !== "contains" || item.value)
          ? item
          : null,
    )
    .filter((item): item is RecordFilter | FilterGroup => item !== null);
  return items.length ? { mode: group.mode, items } : null;
}
