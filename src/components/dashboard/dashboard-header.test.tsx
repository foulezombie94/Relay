// @vitest-environment jsdom
import React, { useState } from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DashboardHeader, DashboardEditNotice, matchesWidgetSearch } from "./dashboard-header";
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("finds widgets without depending on case, accents or surrounding spaces", () => {
  expect(matchesWidgetSearch("Dernières opportunités", "  DERNIERES  ")).toBe(true);
  expect(matchesWidgetSearch("Tâches à suivre", "taches")).toBe(true);
  expect(matchesWidgetSearch("Pipeline commercial", "tâches")).toBe(false);
  expect(matchesWidgetSearch("Pipeline commercial", "")).toBe(true);
});
it("updates and clears the widget search without submitting or changing its children", () => {
  function Header() {
    const [search, setSearch] = useState("");
    return (
      <DashboardHeader title="Tableau de bord" search={search} onSearch={setSearch}>
        <button>Personnaliser</button>
      </DashboardHeader>
    );
  }
  render(<Header />);
  const search = screen.getByRole("searchbox", {
    name: "Rechercher un widget",
  }) as HTMLInputElement;
  fireEvent.change(search, { target: { value: "pipeline" } });
  expect(search.value).toBe("pipeline");
  fireEvent.click(screen.getByRole("button", { name: "Effacer la recherche de widgets" }));
  expect(search.value).toBe("");
  expect(screen.getByRole("button", { name: "Personnaliser" })).toBeDefined();
});
it("identifies editing in the header and announces unsaved changes", () => {
  const page = render(
    <>
      <DashboardHeader title="Tableau de bord" search="" onSearch={() => {}} editing />
      <DashboardEditNotice />
    </>,
  );
  expect(screen.getAllByText("Mode édition")).toHaveLength(2);
  expect(screen.getByRole("status").textContent).toContain("ne sont pas encore enregistrées");
  page.rerender(<DashboardHeader title="Tableau de bord" search="" onSearch={() => {}} />);
  expect(screen.queryByText("Mode édition")).toBeNull();
});
it.each([{ ctrlKey: true }, { metaKey: true }])(
  "focuses the top search with the platform shortcut and isolates it from sidebar search: %o",
  (modifier) => {
    const sidebarSearch = vi.fn();
    window.addEventListener("keydown", sidebarSearch);
    const page = render(<DashboardHeader title="Tableau de bord" search="" onSearch={() => {}} />);
    fireEvent.keyDown(document.body, { key: "k", ...modifier });
    expect(document.activeElement).toBe(
      screen.getByRole("searchbox", { name: "Rechercher un widget" }),
    );
    expect(sidebarSearch).not.toHaveBeenCalled();
    page.unmount();
    fireEvent.keyDown(document.body, { key: "k", ...modifier });
    expect(sidebarSearch).toHaveBeenCalledOnce();
    window.removeEventListener("keydown", sidebarSearch);
  },
);
