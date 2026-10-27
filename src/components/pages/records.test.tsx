// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecordsPage } from "./records";
import { RelatedRecordList } from "../records/overview";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: () => ({ error: null }),
}));
vi.mock("../providers/data-provider", () => ({
  useWorkspace: () => ({
    workspace: { id: "workspace", role: "owner", currency: "EUR" },
    objects: [
      { id: "people", slug: "people", name: "Personnes", standard: true },
      { id: "companies", slug: "companies", name: "Entreprises", standard: true },
    ],
  }),
  useRows: () => ({ data: { data: [], count: 0 }, error: null, isPending: false }),
  useSave: () => ({ save: vi.fn(), remove: vi.fn(), busy: false }),
  request: vi.fn(),
}));

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("keeps one settings control after contact view updates and opens its popover", () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = () => (
    <QueryClientProvider client={client}>
      <RecordsPage slug="people" />
    </QueryClientProvider>
  );
  const page = render(view());
  for (let i = 0; i < 8; i++) {
    page.rerender(view());
    expect(
      screen.getAllByRole("button", { name: "Paramètres de la vue des contacts" }),
    ).toHaveLength(1);
  }
  expect(errors.mock.calls.filter((args) => String(args[0]).includes("same key"))).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Paramètres de la vue des contacts" }));
  expect(screen.getByRole("dialog").textContent).toContain("Réglages de la vue");
  fireEvent.click(screen.getByRole("button", { name: "Décroissant ↓" }));
  expect(screen.getByRole("button", { name: "Croissant ↑" })).toBeDefined();
  expect(screen.getAllByRole("button", { name: "Paramètres de la vue des contacts" })).toHaveLength(
    1,
  );
});

it("distinguishes a filtered empty result from an empty workspace and allows clearing filters", () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RecordsPage slug="companies" />
    </QueryClientProvider>,
  );
  expect(screen.getByText("Aucune entreprise pour le moment")).toBeDefined();
  fireEvent.change(screen.getByRole("textbox", { name: "Rechercher" }), {
    target: { value: "introuvable" },
  });
  expect(screen.getByText("Aucun résultat pour ces filtres")).toBeDefined();
  expect(screen.queryByText("Aucune entreprise pour le moment")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Effacer les filtres" }));
  expect((screen.getByRole("textbox", { name: "Rechercher" }) as HTMLInputElement).value).toBe("");
  expect(screen.getByText("Aucune entreprise pour le moment")).toBeDefined();
});

it("qualifies related-record links with the record workspace for full navigation", () => {
  const record = {
    id: "record-b",
    workspace_id: "workspace-b",
    object_id: "companies",
    created_at: "2026-10-27T00:00:00Z",
    display_name: "Entreprise B",
    email: null,
    domain: null,
    stage: "Nouveau",
    amount: 0,
    currency: "EUR",
    owner_id: null,
    attributes: {},
    archived: false,
    version: 1,
    close_date: null,
  };
  render(
    <RelatedRecordList
      records={[record]}
      objects={[
        {
          id: "companies",
          workspace_id: "workspace-b",
          created_at: record.created_at,
          name: "Entreprises",
          slug: "companies",
          standard: true,
          icon: "building",
        },
      ]}
      onRelations={vi.fn()}
      empty="Aucune relation"
    />,
  );
  const href = screen.getByRole("link", { name: /Entreprise B/ }).getAttribute("href")!;
  const url = new URL(href, "https://crm.test");
  expect(url.searchParams.get("record")).toBe(record.id);
  expect(url.searchParams.get("workspace")).toBe(record.workspace_id);
});
