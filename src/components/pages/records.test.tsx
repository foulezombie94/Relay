// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RecordsPage } from "./records";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ error: null }) }));
vi.mock("../providers/data-provider", () => ({
  useWorkspace: () => ({
    workspace: { id: "workspace", role: "owner", currency: "EUR" },
    objects: [{ id: "people", slug: "people", name: "Personnes", standard: true }],
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
  const page = render(<RecordsPage slug="people" />);
  for (let i = 0; i < 8; i++) {
    page.rerender(<RecordsPage slug="people" />);
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
