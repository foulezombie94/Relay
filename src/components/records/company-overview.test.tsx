// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { CompanyOverview } from "./company-overview";
import type { CrmRecord } from "@/lib/domain/types";
const record: CrmRecord = {
  id: "company",
  workspace_id: "workspace",
  object_id: "companies",
  created_at: "2026-10-27T00:00:00Z",
  display_name: "Entreprise QA",
  email: null,
  domain: "example.invalid",
  stage: "Nouveau",
  amount: 0,
  currency: "EUR",
  owner_id: null,
  attributes: {},
  archived: false,
  version: 1,
  close_date: null,
};
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("renders highlights from the current record without invented metrics and opens the linked sections", () => {
  const onTab = vi.fn();
  render(
    <CompanyOverview
      record={record}
      context={{
        record,
        relations: [],
        related: [],
        timeline: [],
        counts: {},
        truncated: false,
        relation_count: 0,
      }}
      objects={[]}
      onTab={onTab}
    />,
  );
  expect(screen.getAllByText("Non renseigné").length).toBe(2);
  expect(screen.queryByText("$31,200,000")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Prochaine tâche/ }));
  expect(onTab).toHaveBeenCalledWith("tasks");
  expect(screen.getByText("Aucun email consigné pour cette entreprise.")).toBeDefined();
});
