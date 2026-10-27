// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), push: vi.fn() }));
vi.mock("sonner", () => ({ toast: mocks }));
vi.mock("./appearance-provider", () => ({
  AppearanceProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/lib/supabase/client", () => ({
  browserDb: () => ({
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
  }),
}));
import { AppProvider, useSave, useWorkspace } from "./data-provider";
import { Editor } from "../ui";
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  usePathname: () => window.location.pathname,
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
const workspace = "10000000-0000-4000-8000-000000000001";
const object = "30000000-0000-4000-8000-000000000003";
const close = vi.fn();
function SaveForm() {
  const { save, busy } = useSave();
  return (
    <Editor
      open
      onClose={close}
      title="Créer un contact"
      fields={[
        { key: "display_name", label: "Nom", required: true },
        { key: "email", label: "Email", type: "email" },
      ]}
      busy={busy}
      onSave={(values) => save("records", { ...values, object_id: object })}
    />
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/app/companies");
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
async function setup(write: (init: RequestInit) => Promise<Response>) {
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (init.method === "POST") return write(init);
    if (url === "/api/workspaces")
      return Response.json({ data: [{ id: workspace, role: "owner" }], user: { id: "test-user" } });
    return Response.json({ data: [{ id: object }], count: 1 });
  });
  vi.stubGlobal("fetch", fetch);
  render(
    <AppProvider userId="test-user">
      <SaveForm />
    </AppProvider>,
  );
  const name = await screen.findByLabelText(/Nom/);
  fireEvent.change(name, { target: { value: " Alice " } });
  fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "a@example.test" } });
  return () =>
    fireEvent.submit(screen.getByRole("button", { name: "Enregistrer" }).closest("form")!);
}
describe("complete client save flow", () => {
  it("reports success only after a real row confirmation", async () => {
    const submit = await setup(async (init) =>
      Response.json(
        {
          data: {
            id: new Headers(init.headers).get("Idempotency-Key"),
            ...JSON.parse(String(init.body)),
          },
        },
        { status: 201 },
      ),
    );
    submit();
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(mocks.success).toHaveBeenCalledWith("Enregistré");
  });
  it("keeps data and refuses false success on zero confirmed rows", async () => {
    const submit = await setup(async () => Response.json({ data: null }, { status: 201 }));
    submit();
    await screen.findByRole("alert");
    expect(mocks.success).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/Email/) as HTMLInputElement).value).toBe("a@example.test");
  });
  it("retries an interrupted creation with the same UUID after preserving the form", async () => {
    const attempts: string[] = [];
    const submit = await setup(async (init) => {
      attempts.push(new Headers(init.headers).get("Idempotency-Key")!);
      if (attempts.length === 1) throw new TypeError("ECONNRESET");
      return Response.json({ data: { id: attempts[0], ...JSON.parse(String(init.body)) } });
    });
    submit();
    await screen.findByRole("alert");
    expect(mocks.success).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Enregistrer" }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    submit();
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toBe(attempts[0]);
  });
});

const secondWorkspace = "20000000-0000-4000-8000-000000000002";
function WorkspaceControls() {
  const { workspace, switchWorkspace } = useWorkspace();
  return (
    <>
      <output aria-label="Espace actif">{workspace.id}</output>
      <input aria-label="Brouillon de fiche" defaultValue="" />
      <button onClick={() => switchWorkspace(secondWorkspace)}>Choisir B</button>
      <button onClick={() => switchWorkspace("not-a-membership")}>
        Choisir un espace interdit
      </button>
    </>
  );
}
function workspaceSetup(path = "/app/companies") {
  window.history.replaceState(null, "", path);
  const fetch = vi.fn(async (url: string) =>
    url === "/api/workspaces"
      ? Response.json({
          data: [
            { id: workspace, name: "A", role: "owner" },
            { id: secondWorkspace, name: "B", role: "member" },
          ],
          user: { id: "test-user" },
        })
      : Response.json({ data: [], count: 0 }),
  );
  vi.stubGlobal("fetch", fetch);
  const tree = () => (
    <AppProvider userId="test-user">
      <WorkspaceControls />
    </AppProvider>
  );
  return { fetch, tree };
}
describe("workspace navigation context", () => {
  it("navigates to the new workspace dashboard when leaving a workspace-specific list", async () => {
    const { tree } = workspaceSetup("/app/list-old?workspace=" + workspace);
    render(tree());
    await screen.findByLabelText("Espace actif");
    fireEvent.click(screen.getByRole("button", { name: "Choisir B" }));
    expect(mocks.push).toHaveBeenCalledWith("/app/dashboard?workspace=" + secondWorkspace);
  });
  it("writes a selection into the URL, drops stale resource IDs and restores it on remount", async () => {
    const { tree } = workspaceSetup("/app/companies?record=old&pipeline=old#details");
    const first = render(tree());
    await screen.findByLabelText("Espace actif");
    fireEvent.change(screen.getByLabelText("Brouillon de fiche"), {
      target: { value: "Draft for A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Choisir B" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Espace actif").textContent).toBe(secondWorkspace),
    );
    const url = new URL(window.location.href);
    expect(url.searchParams.get("workspace")).toBe(secondWorkspace);
    expect(url.searchParams.has("record")).toBe(false);
    expect(url.searchParams.has("pipeline")).toBe(false);
    expect(url.hash).toBe("#details");
    expect((screen.getByLabelText("Brouillon de fiche") as HTMLInputElement).value).toBe("");
    first.unmount();
    render(tree());
    expect((await screen.findByLabelText("Espace actif")).textContent).toBe(secondWorkspace);
  });
  it("opens an explicit link in the requested workspace without first fetching another workspace", async () => {
    const { tree, fetch } = workspaceSetup(
      "/app/companies?workspace=" + secondWorkspace + "&record=b",
    );
    render(tree());
    expect((await screen.findByLabelText("Espace actif")).textContent).toBe(secondWorkspace);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/" + secondWorkspace + "/objects"),
        expect.anything(),
      ),
    );
    expect(fetch.mock.calls.some(([url]) => url.startsWith("/api/" + workspace + "/"))).toBe(false);
  });
  it.each(["not-a-membership", ""])(
    "does not silently fall back for an inaccessible explicit workspace (%s)",
    async (id) => {
      const { tree, fetch } = workspaceSetup("/app/companies?workspace=" + id + "&record=private");
      render(tree());
      expect(await screen.findByRole("heading", { name: "Espace inaccessible" })).toBeDefined();
      expect(screen.queryByLabelText("Espace actif")).toBeNull();
      expect(fetch.mock.calls.every(([url]) => url === "/api/workspaces")).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "B" }));
      expect((await screen.findByLabelText("Espace actif")).textContent).toBe(secondWorkspace);
      expect(window.location.search).not.toContain("record=");
    },
  );
  it("keeps the active workspace when an internal navigation omits the parameter", async () => {
    const { tree } = workspaceSetup("/app/companies?workspace=" + secondWorkspace);
    const view = render(tree());
    await screen.findByLabelText("Espace actif");
    window.history.replaceState(null, "", "/app/tasks");
    view.rerender(tree());
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("workspace")).toBe(secondWorkspace),
    );
    expect(screen.getByLabelText("Espace actif").textContent).toBe(secondWorkspace);
  });
  it("honours a new explicit URL and ignores a workspace not in the membership list", async () => {
    const { tree } = workspaceSetup();
    const view = render(tree());
    await screen.findByLabelText("Espace actif");
    window.history.replaceState(null, "", "/app/companies?workspace=" + secondWorkspace);
    view.rerender(tree());
    await waitFor(() =>
      expect(screen.getByLabelText("Espace actif").textContent).toBe(secondWorkspace),
    );
    fireEvent.click(screen.getByRole("button", { name: "Choisir un espace interdit" }));
    expect(screen.getByLabelText("Espace actif").textContent).toBe(secondWorkspace);
    expect(new URLSearchParams(window.location.search).get("workspace")).toBe(secondWorkspace);
  });
});
