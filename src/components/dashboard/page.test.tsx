// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DashboardPage } from "./page";
import { dashboardTemplate, type DashboardInput } from "@/lib/domain/dashboards";

const state = vi.hoisted(() => ({ role: "owner", save: vi.fn() }));
vi.mock("../providers/data-provider", () => ({
  useWorkspace: () => ({
    workspace: { id: "w", role: state.role },
    user: { id: "u" },
    objects: [],
  }),
  useRows: () => ({ data: { data: [], count: 0 }, isPending: false, error: null }),
  useSave: () => ({ save: state.save, remove: vi.fn(), busy: false }),
  request: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    if (queryKey[2] === "dashboard-details") return { error: null };
    if (queryKey[2] === "dashboard-results") {
      const dashboard = (queryKey[5] as DashboardInput | null) ?? dashboardTemplate("management");
      return {
        data: {
          data: {
            generated_at: "2026-10-26",
            range: { label: "Toutes les dates" },
            tiles: dashboard.config.map((tile) => ({
              tile,
              entries: { data: [], total: 0, partial: false, next_cursor: null },
            })),
          },
        },
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      };
    }
    return { data: { data: [] }, isPending: false, error: null };
  },
}));
beforeEach(() => {
  window.history.replaceState({}, "", "/app/dashboard");
  vi.stubGlobal("React", React);
  state.role = "owner";
  state.save.mockReset().mockResolvedValue({ id: "saved" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("visibly enters editing and only saves following the explicit save action", async () => {
  render(<DashboardPage />);
  expect(screen.queryByText("Mode édition")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Personnaliser" }));
  expect(document.querySelector('main[data-editing="true"]')).not.toBeNull();
  expect(screen.getAllByText("Mode édition")).toHaveLength(2);
  expect(state.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
  expect(state.save.mock.calls[0][0]).toBe("report_dashboards");
  expect(state.save.mock.calls[0][1].config).toHaveLength(4);
});
it("cancels editing without a write and keeps the search scoped to widgets", () => {
  render(<DashboardPage />);
  fireEvent.change(screen.getByRole("searchbox", { name: "Rechercher un widget" }), {
    target: { value: "taches" },
  });
  expect(screen.getByRole("heading", { name: "Tâches à suivre" })).toBeDefined();
  expect(screen.queryByRole("heading", { name: "Pipeline commercial" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Personnaliser" }));
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(screen.queryByText("Mode édition")).toBeNull();
  expect(state.save).not.toHaveBeenCalled();
});
it("keeps viewers in read mode", () => {
  state.role = "viewer";
  render(<DashboardPage />);
  expect(screen.queryByRole("button", { name: "Personnaliser" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Ajouter un widget" })).toBeNull();
});
