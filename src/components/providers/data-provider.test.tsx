// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: mocks }));
vi.mock("./appearance-provider", () => ({
  AppearanceProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/lib/supabase/client", () => ({
  browserDb: () => ({
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
  }),
}));
import { AppProvider, useSave } from "./data-provider";
import { Editor } from "../ui";
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
