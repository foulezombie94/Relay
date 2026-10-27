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
const context = {
  record,
  relations: [],
  related: [],
  timeline: [],
  counts: {},
  truncated: false,
  relation_count: 0,
};
it("shows an honest empty relationship and opens follow-up without creating data", () => {
  const onTab = vi.fn();
  render(<CompanyOverview record={record} context={context} objects={[]} onTab={onTab} />);
  expect(screen.queryByText("$31,200,000")).toBeNull();
  expect(screen.queryByText("Financement levé")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Organiser le suivi" }));
  expect(onTab).toHaveBeenCalledWith("tasks");
  fireEvent.click(screen.getByRole("button", { name: "Emails" }));
  expect(screen.getByText("Aucun email consigné pour cette entreprise.")).toBeDefined();
});
it("prioritizes an overdue commitment over completed tasks and navigates to its actual resource", () => {
  const onTab = vi.fn();
  render(
    <CompanyOverview
      record={record}
      context={{
        ...context,
        timeline: [
          {
            workspace_id: "workspace",
            id: "done",
            resource: "tasks",
            title: "Terminée",
            status: "done",
            created_at: record.created_at,
            due_date: "2000-01-01",
          },
          {
            workspace_id: "workspace",
            id: "open",
            resource: "tasks",
            title: "Suivi futur",
            status: "open",
            created_at: record.created_at,
            due_date: "2099-01-01",
          },
          {
            workspace_id: "workspace",
            id: "promise",
            resource: "commitments",
            title: "Envoyer la proposition",
            status: "open",
            created_at: record.created_at,
            due_date: "2001-01-01",
          },
        ],
      }}
      objects={[]}
      onTab={onTab}
    />,
  );
  expect(screen.getByText("À REPRENDRE")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Voir l’action" }));
  expect(onTab).toHaveBeenCalledWith("commitments");
});
it("filters emails separately from other activities and labels truncated summaries", () => {
  render(
    <CompanyOverview
      record={record}
      context={{
        ...context,
        truncated: true,
        timeline: [
          {
            workspace_id: "workspace",
            id: "call",
            resource: "activities",
            title: "Appel commercial",
            type: "call",
            created_at: "2026-10-26T10:00:00Z",
          },
          {
            workspace_id: "workspace",
            id: "email",
            resource: "activities",
            title: "Réponse au devis",
            type: "email",
            created_at: "2026-10-26T09:00:00Z",
          },
        ],
      }}
      objects={[]}
      onTab={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Emails" }));
  expect(screen.queryByText("Appel commercial")).toBeNull();
  expect(screen.getByText("Réponse au devis")).toBeDefined();
  expect(screen.getByText("Aperçu partiel")).toBeDefined();
});
