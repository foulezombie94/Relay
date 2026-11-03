// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FilterBuilder, filterFields, operatorsFor } from "./filter-builder";
import type { FilterGroup } from "@/lib/domain/record-filters";

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const fields = filterFields({
  attributes: [
    {
      id: "a",
      workspace_id: "w",
      created_at: "",
      object_id: "o",
      key: "secteur",
      name: "Secteur",
      type: "select",
      required: false,
      options: ["SaaS"],
      archived: false,
    },
    {
      id: "b",
      workspace_id: "w",
      created_at: "",
      object_id: "o",
      key: "ca",
      name: "CA",
      type: "number",
      required: false,
      options: [],
      archived: false,
    },
  ],
  deals: true,
  stageOptions: [{ value: "Démo", label: "Démo" }],
  members: [],
  pipelines: [],
});

it("offers only operators the server accepts for each field", () => {
  expect(operatorsFor(fields.find((f) => f.key === "amount")!)).toContain("gt");
  expect(operatorsFor(fields.find((f) => f.key === "attributes.ca")!)).not.toContain("gt");
  expect(operatorsFor(fields.find((f) => f.key === "stage")!)).not.toContain("contains");
});

it("builds nested AND/OR groups", () => {
  let latest: FilterGroup | undefined;
  function Harness() {
    const [value, setValue] = useState<FilterGroup | undefined>();
    latest = value;
    return <FilterBuilder value={value} fields={fields} onChange={setValue} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: /Filtres avancés/ }));
  fireEvent.click(screen.getByRole("button", { name: /Ajouter un filtre/ }));
  fireEvent.click(screen.getAllByRole("button", { name: /Ajouter un groupe/ })[0]);
  fireEvent.change(screen.getByLabelText("Combiner les conditions"), { target: { value: "or" } });
  expect(latest?.mode).toBe("or");
  expect(latest?.items).toHaveLength(2);
  // A new group starts with the opposite mode of its parent at creation time (AND → OR).
  expect(latest?.items[1]).toMatchObject({ mode: "or", items: [expect.any(Object)] });
  fireEvent.click(screen.getByRole("button", { name: /Tout effacer/ }));
  expect(latest).toBeUndefined();
});
