// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SearchDialogView } from "./search-dialog-view";
import { SearchDialog } from "./search-dialog";
import { searchEntries, type SearchEntry } from "./search-model";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  context: {
    workspace: { id: "w1", name: "Équipe Rivage" },
    user: { id: "alice" },
    objects: [{ id: "companies", slug: "companies", standard: true }],
  },
}));
vi.mock("../providers/data-provider", () => ({
  useWorkspace: () => mocks.context,
  request: mocks.request,
}));
vi.mock("next/link", () => ({
  default: ({
    prefetch,
    onClick,
    ...props
  }: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    void prefetch;
    return (
      <a
        {...props}
        onClick={(event) => {
          event.preventDefault();
          onClick?.(event);
        }}
      />
    );
  },
}));
beforeEach(() => {
  vi.stubGlobal("React", React);
  mocks.request.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const entries: SearchEntry[] = [
  {
    id: "one",
    title: "Studio Rivage",
    href: "/app/companies?record=one",
    category: "Fiches",
    excerpt: "Note confidentielle",
  },
  {
    id: "two",
    title: "Maison Atlas",
    href: "/app/companies?record=two",
    category: "Fiches",
    excerpt: "Contrat à préparer",
  },
];
const base = {
  open: true,
  onClose: vi.fn(),
  workspaceName: "Rivage",
  term: "Atlas",
  onTerm: vi.fn(),
  scope: "all",
  onScope: vi.fn(),
  entries,
};
it("supports keyboard result navigation, opens a result, and closes with the shortcut", () => {
  const close = vi.fn();
  render(<SearchDialogView {...base} onClose={close} />);
  const input = screen.getByRole("combobox", { name: "Rechercher dans votre espace" });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(screen.getByRole("option", { name: /Maison Atlas/ }).getAttribute("aria-selected")).toBe(
    "true",
  );
  fireEvent.keyDown(input, { key: "Enter" });
  expect(close).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(input, { key: "k", metaKey: true });
  expect(close).toHaveBeenCalledTimes(2);
});
it("withdraws result text and previews on loading or rejected access", () => {
  const view = render(<SearchDialogView {...base} />);
  expect(screen.getByText("Note confidentielle")).toBeDefined();
  view.rerender(<SearchDialogView {...base} error="Accès révoqué" />);
  expect(screen.getByRole("alert").textContent).toBe("Accès révoqué");
  expect(screen.queryByText("Note confidentielle")).toBeNull();
  expect(screen.queryByRole("option")).toBeNull();
  view.rerender(<SearchDialogView {...base} loading />);
  expect(screen.queryByText("Note confidentielle")).toBeNull();
});
it("switches between compact and expanded search without losing the query or selected result", () => {
  const close = vi.fn();
  render(<SearchDialogView {...base} onClose={close} />);
  const dialog = screen.getByRole("dialog");
  const input = screen.getByRole("combobox");
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("button", { name: "Réduire la recherche" }));
  expect(dialog.getAttribute("data-preview")).toBe("false");
  expect(screen.queryByRole("complementary", { name: "Aperçu du résultat" })).toBeNull();
  expect((input as HTMLInputElement).value).toBe("Atlas");
  expect(screen.getByRole("option", { name: /Maison Atlas/ }).getAttribute("aria-selected")).toBe(
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Agrandir la recherche" }));
  expect(dialog.getAttribute("data-preview")).toBe("true");
  expect(
    within(screen.getByRole("complementary", { name: "Aperçu du résultat" })).getByRole("heading", {
      name: "Maison Atlas",
    }),
  ).toBeDefined();
  expect(close).not.toHaveBeenCalled();
});
it("debounces the real authenticated endpoint, filters scopes and hides rejected results", async () => {
  mocks.request.mockResolvedValue({
    groups: [
      {
        resource: "records",
        count: 1,
        results: [
          {
            id: "r1",
            object_id: "companies",
            title: "Client privé",
            excerpt: "Contexte autorisé",
            private: false,
          },
        ],
      },
    ],
    related: [],
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SearchDialog onClose={vi.fn()} />
    </QueryClientProvider>,
  );
  const input = screen.getByRole("combobox", { name: "Rechercher dans votre espace" });
  fireEvent.change(input, { target: { value: "a" } });
  expect(mocks.request).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "atlas" } });
  expect(await screen.findByRole("option", { name: /Client privé/ })).toBeDefined();
  expect(mocks.request).toHaveBeenCalledExactlyOnceWith("/api/w1/search?q=atlas&scope=all");
  mocks.request.mockRejectedValue(new Error("Accès refusé"));
  fireEvent.click(screen.getByRole("button", { name: "Filtres de recherche" }));
  fireEvent.click(
    within(screen.getByRole("group", { name: "Périmètre de recherche" })).getByRole("button", {
      name: "Notes",
    }),
  );
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Accès refusé"));
  expect(screen.queryByText("Contexte autorisé")).toBeNull();
  expect(mocks.request).toHaveBeenLastCalledWith("/api/w1/search?q=atlas&scope=notes");
});
it("builds routes only for supported resources and encodes record identifiers", () => {
  const result = searchEntries(
    {
      groups: [
        {
          resource: "records",
          count: 1,
          results: [{ id: "r&x", object_id: "o", title: "Client", excerpt: "", private: false }],
        },
        {
          resource: "../admin",
          count: 1,
          results: [{ id: "x", title: "Invalid", excerpt: "", private: false }],
        },
      ],
      related: [],
    },
    [{ id: "o", slug: "companies", standard: true }],
  );
  expect(result).toHaveLength(1);
  expect(result[0].href).toBe("/app/companies?record=r%26x");
});
