// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SidebarProvider } from "../ui/sidebar";
import { AppSidebarView } from "./app-sidebar-view";
import { readSidebarPreferences } from "./sidebar-preferences";
import type { Workspace } from "@/lib/domain/types";

vi.mock("next/link", () => ({
  default: ({ prefetch, ...props }: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    void prefetch;
    return <a {...props} />;
  },
}));
const workspace = { id: "workspace-a", name: "Mon équipe", role: "owner" } as Workspace;
function show(path = "/app/companies", persistPreferences = true, onSearch?: () => void) {
  return render(
    <SidebarProvider interactive={persistPreferences}>
      <AppSidebarView
        workspace={workspace}
        workspaces={[workspace]}
        switchWorkspace={vi.fn()}
        objects={[]}
        user={{ id: "alice", email: "alice@example.test" }}
        path={path}
        onSignOut={vi.fn()}
        persistPreferences={persistPreferences}
        onSearch={onSearch}
      />
    </SidebarProvider>,
  );
}
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
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  });
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("opens the actual child route and lets the user fold it without navigating", () => {
  show("/app/pipelines");
  expect(screen.getByRole("button", { name: "CRM" }).getAttribute("aria-expanded")).toBe("true");
  const link = screen.getByRole("link", { name: "Pipelines" });
  expect(link.getAttribute("aria-current")).toBe("page");
  fireEvent.click(screen.getByRole("button", { name: "Replier Opportunités" }));
  expect(screen.queryByRole("link", { name: "Pipelines" })).toBeNull();
  expect(screen.getByRole("link", { name: "Opportunités" }).getAttribute("href")).toBe(
    "/app/deals",
  );
});
it("opens the search overlay from the sidebar click and Ctrl+K without navigating", () => {
  const onSearch = vi.fn();
  show("/app/companies", true, onSearch);
  const url = window.location.href;
  fireEvent.click(screen.getByRole("link", { name: "Rechercher" }));
  expect(onSearch).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
  expect(onSearch).toHaveBeenCalledTimes(2);
  expect(window.location.href).toBe(url);
});
it("keeps extra shortcuts named and reachable in the overflow menu", async () => {
  localStorage.setItem(
    "relay_nav_preferences:alice:workspace-a",
    JSON.stringify({ shortcuts: ["dashboard", "assistant", "priorities", "reports", "deals"] }),
  );
  show();
  const nav = screen.getByRole("navigation", { name: "Accès rapide" });
  expect(within(nav).getAllByRole("link")).toHaveLength(2);
  expect(within(nav).getByRole("link", { name: "Dashboard" })).toBeDefined();
  expect(within(nav).getByRole("link", { name: "Ask Zyliad" })).toBeDefined();
  fireEvent.keyDown(within(nav).getByRole("button", { name: "Plus de raccourcis" }), {
    key: "Enter",
  });
  expect(await screen.findByRole("menuitem", { name: "À traiter" })).toBeDefined();
  expect(screen.getByRole("menuitem", { name: "Rapports" }).getAttribute("href")).toBe(
    "/app/reports",
  );
  expect(screen.getByRole("menuitem", { name: "Opportunités" }).getAttribute("href")).toBe(
    "/app/deals",
  );
});
it.each([
  { platform: "MacIntel", label: "⌘ K", aria: "Meta+K", modifier: { metaKey: true } },
  { platform: "Win32", label: "Ctrl+K", aria: "Control+K", modifier: { ctrlKey: true } },
])("shows and handles the search shortcut on $platform", ({ platform, label, aria, modifier }) => {
  vi.spyOn(window.navigator, "platform", "get").mockReturnValue(platform);
  show();
  const link = screen.getByRole("link", { name: "Rechercher" });
  expect(within(link).getByText(label)).toBeDefined();
  expect(link.getAttribute("aria-keyshortcuts")).toBe(aria);
  const click = vi.spyOn(link, "click").mockImplementation(() => {});
  fireEvent.keyDown(document.body, { key: "k", ...modifier });
  expect(click).toHaveBeenCalledTimes(1);
  const input = document.createElement("input");
  document.body.append(input);
  fireEvent.keyDown(input, { key: "k", ...modifier });
  expect(click).toHaveBeenCalledTimes(1);
  input.remove();
});
it("persists a folded group and keeps all other section controls usable", () => {
  const first = show();
  fireEvent.click(screen.getByRole("button", { name: "CRM" }));
  expect(screen.queryByRole("link", { name: "Entreprises" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Communication" }));
  expect(screen.getByRole("button", { name: "Déplier Messages" })).toBeDefined();
  first.unmount();
  show("/app/dashboard");
  expect(screen.getByRole("button", { name: "CRM" }).getAttribute("aria-expanded")).toBe("false");
  expect(screen.getByRole("button", { name: "Communication" }).getAttribute("aria-expanded")).toBe(
    "true",
  );
});
it("adds and removes a favorite without changing or duplicating its target", async () => {
  show();
  fireEvent.keyDown(screen.getByRole("button", { name: "Actions : Entreprises" }), {
    key: "Enter",
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Ajouter aux favoris" }));
  const favoritesButton = screen.getByRole("button", { name: "Favoris" });
  const panel = document.getElementById(favoritesButton.getAttribute("aria-controls")!)!;
  expect(within(panel).getByRole("link", { name: "Entreprises" }).getAttribute("href")).toBe(
    "/app/companies",
  );
  expect(
    JSON.parse(localStorage.getItem("relay_nav_preferences:alice:workspace-a")!).favorites,
  ).toEqual(["companies"]);
  fireEvent.keyDown(within(panel).getByRole("button", { name: "Actions : Entreprises" }), {
    key: "Enter",
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Retirer des favoris" }));
  expect(screen.queryByRole("button", { name: "Favoris" })).toBeNull();
  expect(screen.getByRole("link", { name: "Entreprises" })).toBeDefined();
});
it("bounds keyboard resizing and leaves public previews independent of saved preferences", () => {
  localStorage.setItem("relay_sidebar_width", "410");
  localStorage.setItem(
    "relay_nav_preferences:alice:workspace-a",
    JSON.stringify({ favorites: ["companies"] }),
  );
  const write = vi.spyOn(Storage.prototype, "setItem");
  show("/app/companies", false);
  const rail = screen.getByRole("separator", { name: "Redimensionner la barre latérale" });
  expect(rail.getAttribute("aria-valuenow")).toBe("270");
  fireEvent.keyDown(rail, { key: "End" });
  fireEvent.keyDown(rail, { key: "ArrowRight" });
  expect(rail.getAttribute("aria-valuenow")).toBe("480");
  fireEvent.keyDown(rail, { key: "Home" });
  fireEvent.keyDown(rail, { key: "ArrowLeft" });
  expect(rail.getAttribute("aria-valuenow")).toBe("220");
  expect(screen.queryByRole("button", { name: "Favoris" })).toBeNull();
  expect(write).not.toHaveBeenCalled();
});
it("rejects stale, repeated and foreign IDs in navigation preferences", () => {
  expect(
    readSidebarPreferences(
      '{"order":["communication","communication","missing"],"hidden":["crm","bad"],"favorites":["companies","https://example.test","companies"]}',
      ["crm", "communication"],
      ["companies"],
    ),
  ).toMatchObject({ order: ["communication", "crm"], hidden: ["crm"], favorites: ["companies"] });
  expect(readSidebarPreferences("invalid", ["crm"], [])).toMatchObject({
    order: ["crm"],
    hidden: [],
    favorites: [],
  });
});
it("customizes sections and individual tabs, restores hidden sections, and remembers the layout", async () => {
  const first = show();
  fireEvent.click(screen.getByRole("button", { name: "Personnaliser la barre latérale" }));
  const editor = screen.getByRole("region", { name: "Personnaliser la barre latérale" });
  expect(screen.queryByRole("navigation", { name: "Navigation principale" })).toBeNull();
  fireEvent.keyDown(within(editor).getByRole("button", { name: "Déplacer Communication" }), {
    key: "ArrowUp",
  });
  fireEvent.click(within(editor).getByRole("button", { name: "Configurer CRM" }));
  fireEvent.click(within(editor).getByRole("checkbox", { name: "Afficher Personnes" }));
  fireEvent.click(within(editor).getByRole("button", { name: "Masquer la section Analyse" }));
  expect(within(editor).queryByRole("button", { name: "Configurer Analyse" })).toBeNull();
  fireEvent.keyDown(within(editor).getByRole("button", { name: "Ajouter une section" }), {
    key: "Enter",
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Analyse" }));
  expect(within(editor).getByRole("button", { name: "Configurer Analyse" })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Terminé" }));
  expect(screen.queryByRole("region", { name: "Personnaliser la barre latérale" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Personnes" })).toBeNull();
  const saved = JSON.parse(localStorage.getItem("relay_nav_preferences:alice:workspace-a")!);
  expect(saved.order.slice(0, 2)).toEqual(["communication", "crm"]);
  expect(saved.hiddenEntries).toEqual(["people"]);
  expect(saved.hidden).toEqual([]);
  first.unmount();
  show();
  expect(screen.queryByRole("link", { name: "Personnes" })).toBeNull();
  expect(screen.getByRole("link", { name: "Entreprises" })).toBeDefined();
});
it("removes an access shortcut and restores the default layout without erasing favorites", () => {
  localStorage.setItem(
    "relay_nav_preferences:alice:workspace-a",
    JSON.stringify({ favorites: ["companies"] }),
  );
  show();
  fireEvent.click(screen.getByRole("button", { name: "Personnaliser la barre latérale" }));
  fireEvent.click(screen.getByRole("button", { name: "Masquer l’onglet Dashboard" }));
  expect(
    within(screen.getByRole("navigation", { name: "Accès rapide" })).queryByRole("link", {
      name: "Dashboard",
    }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Rétablir la disposition" }));
  fireEvent.click(screen.getByRole("button", { name: "Terminé" }));
  expect(screen.getByRole("link", { name: "Dashboard" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Favoris" })).toBeDefined();
});
