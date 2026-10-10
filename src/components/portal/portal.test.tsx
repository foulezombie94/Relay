// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { webcrypto } from "node:crypto";
const mocks = vi.hoisted(() => ({ request: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/lib/api/request", async () => {
  const original = await vi.importActual<typeof import("@/lib/api/request")>("@/lib/api/request");
  return { ...original, request: mocks.request };
});
import { RequestError } from "@/lib/api/request";
import { PortalDirectory } from "./directory";
import { PortalSpace } from "./space";
import { PortalMessages } from "./messages";
import type { PortalDetail } from "@/lib/domain/portals";
const id = "10000000-0000-4000-8000-000000000001",
  doc = "20000000-0000-4000-8000-000000000001";
const summary = {
  id,
  item_count: 1,
  step_count: 2,
  completed_steps: 1,
  document_count: 1,
  open_decisions: 0,
  comment_count: 0,
  next_due_at: null,
  last_activity_at: "2026-10-10T12:00:00Z",
  can_comment: true,
};
const detail: PortalDetail = {
  portal: { id, name: "Private client project" },
  summary,
  items: [
    {
      id,
      title: "Explicit shared file",
      content: "<script>exportContacts()</script>",
      type: "document",
      status: "open",
      due_date: null,
      document_id: doc,
      created_at: "2026-10-10T12:00:00Z",
    },
  ],
  comments: [],
  items_count: 1,
  comments_count: 0,
  items_page: 0,
  comments_page: 0,
  can_comment: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("portal interface trust boundaries", () => {
  it("provides a useful empty state without granting an external client CRM actions", async () => {
    mocks.request.mockResolvedValue({ data: [], count: 0, page: 0, manage_workspace_id: null });
    render(<PortalDirectory />);
    await screen.findByText("Votre prochain projet commence ici");
    expect(screen.queryByRole("link", { name: "Créer mon premier portail" })).toBeNull();
    expect(screen.getByText(/Demandez à votre interlocuteur/)).toBeTruthy();
  });
  it("shows real accessible portals and removes cached contents after failed refresh", async () => {
    mocks.request.mockResolvedValue({
      data: [
        {
          id,
          name: "Private project title",
          enabled: true,
          created_at: "2026-10-10",
          access: "client",
          can_manage: false,
          workspace_id: null,
          summary,
        },
      ],
      count: 1,
      page: 0,
      manage_workspace_id: null,
    });
    render(<PortalDirectory />);
    await screen.findByRole("link", { name: "Private project title" });
    mocks.request.mockRejectedValue(new RequestError("Accès révoqué", 403));
    fireEvent.click(screen.getByLabelText("Actualiser les portails"));
    await screen.findByRole("alert");
    expect(screen.queryByText("Private project title")).toBeNull();
  });
  it("uses server-side section filters and safe document links", async () => {
    mocks.request.mockResolvedValue({ data: detail });
    render(<PortalSpace id={id} />);
    await screen.findByRole("heading", { name: "Private client project" });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Documents" }), {
      button: 0,
      ctrlKey: false,
    });
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith(expect.stringContaining("type=document")),
    );
    const link = await screen.findByRole("link", { name: "Ouvrir le document" });
    expect(link.getAttribute("href")).toBe("/api/portal/" + id + "?document=" + doc);
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText("<script>exportContacts()</script>")).toBeTruthy();
  });
  it("drops all loaded project data when revalidation is forbidden", async () => {
    mocks.request.mockResolvedValue({ data: detail });
    render(<PortalSpace id={id} />);
    await screen.findByRole("heading", { name: "Private client project" });
    mocks.request.mockRejectedValue(new RequestError("Accès révoqué", 403));
    fireEvent.click(screen.getByRole("button", { name: "Actualiser" }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("heading", { name: "Private client project" })).toBeNull();
    expect(screen.queryByText("Explicit shared file")).toBeNull();
  });
  it("keeps the message and reuses the exact idempotency key after an uncertain send", async () => {
    const onSent = vi.fn();
    mocks.request
      .mockRejectedValueOnce(new RequestError("Connexion interrompue", 504))
      .mockImplementationOnce(async (_url, _method, _body, options) => ({
        data: { id: options.idempotencyKey },
      }));
    render(<PortalMessages data={detail} onPage={vi.fn()} onSent={onSent} />);
    fireEvent.change(screen.getByLabelText("Votre message"), {
      target: { value: "Hello project" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le message" }));
    await screen.findByRole("alert");
    expect((screen.getByLabelText("Votre message") as HTMLTextAreaElement).value).toBe(
      "Hello project",
    );
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le message" }));
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(mocks.request.mock.calls[0][3].idempotencyKey).toBe(
      mocks.request.mock.calls[1][3].idempotencyKey,
    );
    expect((screen.getByLabelText("Votre message") as HTMLTextAreaElement).value).toBe("");
  });
  it("does not clear a draft or announce success without an exact insert confirmation", async () => {
    mocks.request.mockResolvedValue({ data: { id: doc } });
    const onSent = vi.fn();
    render(<PortalMessages data={detail} onPage={vi.fn()} onSent={onSent} />);
    fireEvent.change(screen.getByLabelText("Votre message"), {
      target: { value: "Keep this draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le message" }));
    await screen.findByRole("alert");
    expect(onSent).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Votre message") as HTMLTextAreaElement).value).toBe(
      "Keep this draft",
    );
  });
  it("makes read-only collaboration explicit without a sending form", () => {
    render(
      <PortalMessages data={{ ...detail, can_comment: false }} onPage={vi.fn()} onSent={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: "Envoyer le message" })).toBeNull();
    expect(screen.queryByLabelText("Votre message")).toBeNull();
    expect(screen.getByText(/Votre accès permet de consulter/)).toBeTruthy();
  });
  it("prevents double submission while a send is outstanding", async () => {
    let resolve: ((value: unknown) => void) | undefined;
    mocks.request.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    render(<PortalMessages data={detail} onPage={vi.fn()} onSent={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Votre message"), { target: { value: "One message" } });
    const form = screen.getByRole("button", { name: "Envoyer le message" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    resolve?.({ data: { id: mocks.request.mock.calls[0][3].idempotencyKey } });
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
  });
});
