import { describe, expect, it } from "vitest";
import {
  conditionToLogic,
  filterCount,
  filterTree,
  groupToLogic,
  sendableFilterTree,
  type FilterGroup,
} from "./record-filters";

describe("nested record filters", () => {
  it("serializes nested AND/OR groups for PostgREST", () => {
    const tree: FilterGroup = {
      mode: "and",
      items: [
        { field: "stage", operator: "equals", value: "Démo" },
        {
          mode: "or",
          items: [
            { field: "amount", operator: "gt", value: "1000" },
            { field: "attributes.secteur", operator: "not_exists" },
          ],
        },
      ],
    };
    expect(groupToLogic(tree)).toBe(
      'and(stage.eq."Démo",or(amount.gt."1000",attributes->>secteur.is.null))',
    );
  });
  it("keeps reserved characters and quotes literal", () => {
    expect(
      conditionToLogic({ field: "display_name", operator: "equals", value: 'a,b).c"d\\' }),
    ).toBe('display_name.eq."a,b).c\\"d\\\\"');
    expect(conditionToLogic({ field: "email", operator: "contains", value: "50%_x" })).toBe(
      'email.ilike."*50\\\\%\\\\_x*"',
    );
  });
  it("rejects too deep or too large trees", () => {
    const deep: FilterGroup = {
      mode: "and",
      items: [
        {
          mode: "or",
          items: [
            {
              mode: "and",
              items: [{ mode: "or", items: [{ field: "email", operator: "exists" }] }],
            },
          ],
        },
      ],
    };
    expect(filterTree.safeParse(deep).success).toBe(false);
    const large: FilterGroup = {
      mode: "or",
      items: Array.from({ length: 2 }, () => ({
        mode: "and" as const,
        items: Array.from({ length: 16 }, () => ({ field: "email", operator: "exists" as const })),
      })),
    };
    expect(filterCount(large)).toBe(32);
    expect(filterTree.safeParse(large).success).toBe(false);
  });
  it("rejects unsupported fields and operators", () => {
    expect(
      filterTree.safeParse({ mode: "and", items: [{ field: "id", operator: "exists" }] }).success,
    ).toBe(false);
    expect(
      filterTree.safeParse({
        mode: "and",
        items: [{ field: "display_name", operator: "gt", value: "1" }],
      }).success,
    ).toBe(false);
  });
  it("drops incomplete conditions and empty groups before sending", () => {
    expect(
      sendableFilterTree({
        mode: "and",
        items: [
          { field: "amount", operator: "gt", value: "" },
          { mode: "or", items: [{ field: "email", operator: "contains", value: "" }] },
          { field: "domain", operator: "contains", value: "acme" },
        ],
      }),
    ).toEqual({ mode: "and", items: [{ field: "domain", operator: "contains", value: "acme" }] });
    expect(sendableFilterTree({ mode: "or", items: [] })).toBeNull();
  });
});
