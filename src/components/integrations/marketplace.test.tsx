// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { marketplaceApps } from "@/lib/integrations/platform/catalog";
import { fixtureContext } from "@/lib/integrations/platform/test-support";
import type { MarketplaceSnapshot } from "@/lib/integrations/platform/marketplace";
const mocks = vi.hoisted(() => ({ request: vi.fn(), app: "", role: "owner" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.app ? { app: mocks.app } : {}),
  usePathname: () => "/app/integrations",
}));
vi.mock("@/lib/api/request", async (original) => ({
  ...(await original<typeof import("@/lib/api/request")>()),
  request: mocks.request,
}));
vi.mock("../providers/data-provider", () => ({
  useWorkspace: () => ({
    workspace: { id: "00000000-0000-4000-8000-000000000001", role: mocks.role },
  }),
  request: mocks.request,
}));
import { IntegrationsPage } from "../pages/integrations";
import { PlatformConnection } from "./platform-connection";
let snapshot: MarketplaceSnapshot;
const fixture = fixtureContext();
function mount(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
function panel() {
  return (
    <PlatformConnection
      connection={fixture.connection}
      integration="gmail"
      snapshot={snapshot}
      workspaceId={fixture.actor.workspaceId}
      admin={mocks.role === "owner"}
      writable={mocks.role !== "viewer"}
      onReconnect={() => {}}
      onChanged={async () => {}}
    />
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.app = "";
  mocks.role = "owner";
  snapshot = {
    enabled: false,
    connections: [],
    policies: [],
    commands: [],
    audit: [],
    apps: marketplaceApps.map((app) => ({
      id: app.id,
      provider: app.provider,
      implemented: app.provider === "google",
      configured: false,
      scopes: [],
      writeScopes: [],
      missing: [],
    })),
  };
  mocks.request.mockImplementation(async (url: string) =>
    url.endsWith("/integration-platform")
      ? snapshot
      : url.includes("?resource=")
        ? { enabled: false, last_sync_at: null }
        : { data: [], configured: false },
  );
});
afterEach(cleanup);
it("shows all 19 entries plus Teams and supports category/search filters", async () => {
  mount(<IntegrationsPage />);
  await waitFor(() => expect(screen.getAllByText("En développement").length).toBeGreaterThan(0));
  expect(screen.getByRole("link", { name: /Apollo/ })).toBeDefined();
  expect(screen.getByRole("link", { name: /Microsoft Teams/ })).toBeDefined();
  expect(
    screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.includes("?app="))
      .length,
  ).toBe(20);
  fireEvent.change(screen.getByRole("textbox", { name: "Search apps" }), {
    target: { value: "Notion" },
  });
  expect(
    screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.includes("?app="))
      .length,
  ).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Effacer la recherche" }));
  fireEvent.click(screen.getByRole("button", { name: /^Fichiers & documents/ }));
  expect(screen.getByRole("link", { name: /OneDrive/ })).toBeDefined();
  expect(screen.queryByRole("link", { name: /^Slack/ })).toBeNull();
});
it("does not offer a working install or claim vendor approval for an unimplemented connector", async () => {
  mocks.app = "slack";
  mount(<IntegrationsPage />);
  await screen.findByText("Connecteur en développement");
  expect(
    screen
      .getAllByRole("button", { name: "En développement" })
      .every((button) => (button as HTMLButtonElement).disabled),
  ).toBe(true);
  expect(screen.queryByText("Official app")).toBeNull();
  expect(mocks.request.mock.calls.every(([, method]) => !method || method === "GET")).toBe(true);
});
it("requires a confirmation before disconnecting the entire shared Google connection", async () => {
  mount(panel());
  await waitFor(() => expect(mocks.request).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "Déconnecter" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText(/toutes les apps Google/)).toBeDefined();
  expect(mocks.request.mock.calls.some(([, method]) => method === "DELETE")).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirmer la déconnexion" }));
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith(
      expect.stringContaining(fixture.connection.id),
      "DELETE",
      { confirm: true },
    ),
  );
});
it("leaves readers unable to edit policies, connect, sync or disconnect", () => {
  mocks.role = "viewer";
  mount(panel());
  expect((screen.getByRole("button", { name: "Déconnecter" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect((screen.getByRole("button", { name: "Synchroniser" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(
    screen.getAllByRole("checkbox").every((checkbox) => (checkbox as HTMLInputElement).disabled),
  ).toBe(true);
  expect(screen.queryByRole("button", { name: "Enregistrer les permissions" })).toBeNull();
});
it("loads exact server parameters before approval and keeps external content as text", async () => {
  const id = "00000000-0000-4000-8000-000000000008";
  snapshot.commands = [
    {
      id,
      connection_id: fixture.connection.id,
      action: "gmail.send",
      risk: 2,
      status: "proposed",
      created_at: fixture.connection.created_at,
      expires_at: new Date(Date.now() + 600000).toISOString(),
      error_code: null,
    },
  ];
  mocks.request.mockImplementation(async (url: string, method?: string) =>
    url.includes("?command=")
      ? {
          action: "gmail.send",
          source: "agent",
          input: { to: "person@example.test", body: "<script>exportAllContacts()</script>" },
          expiresAt: snapshot.commands[0].expires_at,
        }
      : method === "POST"
        ? { status: "succeeded" }
        : { enabled: false },
  );
  mount(panel());
  fireEvent.click(screen.getByRole("button", { name: "Examiner" }));
  await screen.findByRole("button", { name: "Confirmer et exécuter" });
  expect(screen.getByRole("dialog").querySelector("script")).toBeNull();
  expect(screen.getByRole("dialog").textContent).toContain("person@example.test");
  expect(mocks.request.mock.calls.some(([, method]) => method === "POST")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Refuser" }));
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith(
      expect.stringContaining(fixture.connection.id),
      "POST",
      { operation: "reject", commandId: id },
    ),
  );
});
