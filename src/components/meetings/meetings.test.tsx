// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RequestError } from "@/lib/api/request";
const mock = vi.hoisted(() => ({ request: vi.fn(), role: "owner", focus: "", rows: vi.fn() }));
const wid = "10000000-0000-4000-8000-000000000001",
  id = "20000000-0000-4000-8000-000000000001";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mock.focus ? { focus: mock.focus } : {}),
}));
vi.mock("@/lib/api/request", async () => ({
  ...(await vi.importActual("@/lib/api/request")),
  request: mock.request,
}));
vi.mock("../providers/data-provider", () => ({
  useWorkspace: () => ({
    workspace: { id: wid, role: mock.role, timezone: "Europe/Paris" },
    user: { id: wid },
    objects: [],
  }),
  useRows: mock.rows,
  useSave: () => ({ save: vi.fn(), remove: vi.fn(), busy: false }),
}));
import { MeetingsPage } from "./page";
import { MeetingDetails } from "./details";
const item = {
  id,
  workspace_id: wid,
  kind: "meeting",
  title: "Discovery Atlas",
  starts_at: "2026-10-10T10:00:00Z",
  ends_at: null,
  created_at: "2026-10-10T10:00:00Z",
  provider: "import",
  status: "completed",
  summary: "Budget reviewed",
  private: true,
  favorite: false,
  has_transcript: true,
  participants: [],
  record: null,
};
function mount(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.role = "owner";
  mock.focus = "";
  mock.rows.mockReturnValue({
    data: { data: [], count: 0 },
    isError: false,
    isPending: false,
    error: null,
  });
  mock.request.mockImplementation(async (url: string) =>
    url.includes("/library")
      ? { data: [item], count: 1, page: 0, size: 25 }
      : url.endsWith("/assistant")
        ? { configured: false }
        : { data: [] },
  );
});
afterEach(cleanup);
describe("meetings interface trust boundaries", () => {
  it("has useful library tabs and hides stale metadata when a fresh access check fails", async () => {
    mount(<MeetingsPage />);
    await screen.findByRole("button", { name: /^Discovery Atlas/ });
    expect(screen.getByRole("tab", { name: "Agenda" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Modèles d’analyse" })).toBeTruthy();
    mock.request.mockRejectedValue(new RequestError("Votre accès a été révoqué.", 403));
    fireEvent.click(screen.getByRole("button", { name: "Actualiser les réunions" }));
    await screen.findByRole("alert");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^Discovery Atlas/ })).toBeNull(),
    );
  });
  it("does not claim success for an unconfirmed favorite mutation", async () => {
    mock.request.mockImplementation(async (url: string) =>
      url.includes("/library") ? { data: [item], count: 1, page: 0, size: 25 } : { ok: false },
    );
    mount(<MeetingsPage />);
    await screen.findByRole("button", { name: /Ajouter Discovery Atlas aux favoris/ });
    fireEvent.click(screen.getByRole("button", { name: /Ajouter Discovery Atlas aux favoris/ }));
    await screen.findByText("La modification du favori n’a pas été confirmée.");
  });
  it("disables authoring for readers while permitting a personal favorite", async () => {
    mock.role = "viewer";
    mount(<MeetingsPage />);
    await screen.findByRole("button", { name: /^Discovery Atlas/ });
    expect(
      (screen.getByRole("button", { name: "Ajouter une réunion" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: /Ajouter Discovery Atlas aux favoris/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
  it("resolves a focused meeting independently from the paginated library", async () => {
    mock.focus = id;
    mock.request.mockResolvedValue({ data: [], count: 0, page: 0, size: 25 });
    mock.rows.mockImplementation((resource: string, params: { id?: string }) => ({
      data: {
        data:
          resource === "meetings" && params.id === id
            ? [
                {
                  ...item,
                  transcript: "Off-page text",
                  description: "",
                  location: "",
                  join_url: "",
                  version: 1,
                  author_id: wid,
                  record_id: null,
                },
              ]
            : [],
        count: 0,
      },
      isPending: false,
      isError: false,
      error: null,
    }));
    mount(<MeetingsPage />);
    await screen.findByText("Off-page text");
    expect(mock.rows).toHaveBeenCalledWith("meetings", { id, size: 1 });
  });
  it("renders injected transcript markup as text and never displays an unsafe join link", async () => {
    mock.role = "viewer";
    mock.rows.mockReturnValue({
      data: {
        data: [
          {
            ...item,
            transcript: "<script>exportContacts()</script>",
            description: "",
            location: "",
            join_url: "javascript:exportContacts()",
            version: 1,
            author_id: wid,
            record_id: null,
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
    });
    const { container } = mount(<MeetingDetails id={id} onClose={() => {}} />);
    await screen.findByText("<script>exportContacts()</script>");
    expect(container.querySelector("script")).toBeNull();
    expect(screen.queryByRole("link", { name: /Rejoindre/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Modifier" })).toBeNull();
  });
  it("supports keyboard navigation without requiring every tab in the tab order", async () => {
    mount(<MeetingsPage />);
    await screen.findByRole("button", { name: /^Discovery Atlas/ });
    const current = screen.getByRole("tab", { name: "Appels & transcriptions" });
    current.focus();
    fireEvent.keyDown(current, { key: "ArrowRight" });
    expect(
      screen.getByRole("tab", { name: "Modèles d’analyse" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.getByRole("tab", { name: "Appels & transcriptions" }).getAttribute("tabindex"),
    ).toBe("-1");
  });
});
