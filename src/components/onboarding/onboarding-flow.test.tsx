// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
  request: vi.fn(),
  attempt: vi.fn(),
  confirm: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  browserDb: () => ({ auth: { updateUser: mocks.updateUser } }),
}));
vi.mock("@/lib/api/request", async (original) => ({
  ...(await original<typeof import("@/lib/api/request")>()),
  request: mocks.request,
}));
vi.mock("@/lib/api/save-attempt", () => ({ creationAttempt: mocks.attempt }));
import { OnboardingFlow } from "./onboarding-flow";
const id = "550e8400-e29b-41d4-a716-446655440000";
const user = { id: "user-a", email: "camille@example.test", name: "" };
const space = { id, name: "Studio Horizon", role: "owner" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.request.mockResolvedValue({ data: [], user });
  mocks.updateUser.mockResolvedValue({ data: { user }, error: null });
  mocks.attempt.mockResolvedValue({ id, confirm: mocks.confirm });
  vi.stubGlobal(
    "window",
    Object.defineProperty(Object.create(window), "location", {
      value: { origin: "https://relay.example", replace: mocks.replace },
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("onboarding persistence and recovery", () => {
  it("collects the invited newcomer's profile without creating another workspace", async () => {
    mocks.request.mockResolvedValue({ data: [{ ...space, role: "member" }], user });
    render(<OnboardingFlow user={{ ...user, pending: true }} />);
    const input = await screen.findByLabelText("Votre nom complet");
    fireEvent.change(input, { target: { value: "Camille Martin" } });
    fireEvent.submit(input.closest("form")!);
    await screen.findByText("Votre espace est prêt.");
    expect(mocks.attempt).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Nom de votre espace")).toBeNull();
  });
  it("keeps the profile step after an interrupted Auth update", async () => {
    mocks.updateUser.mockRejectedValue(new TypeError("private upstream error"));
    render(<OnboardingFlow user={user} />);
    const input = await screen.findByLabelText("Votre nom complet");
    fireEvent.change(input, { target: { value: "Camille Martin" } });
    fireEvent.submit(input.closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toContain("Connexion interrompue");
    expect((input as HTMLInputElement).value).toBe("Camille Martin");
    expect(screen.queryByLabelText("Nom de votre espace")).toBeNull();
  });
  it("requires acknowledgement from the same Auth user before advancing", async () => {
    mocks.updateUser.mockResolvedValue({ data: { user: { id: "other-user" } }, error: null });
    render(<OnboardingFlow user={user} />);
    const input = await screen.findByLabelText("Votre nom complet");
    fireEvent.change(input, { target: { value: "Camille Martin" } });
    fireEvent.submit(input.closest("form")!);
    await screen.findByRole("alert");
    expect(screen.queryByLabelText("Nom de votre espace")).toBeNull();
  });
  it("resumes an existing workspace without creating another and validates finalization", async () => {
    mocks.request.mockResolvedValue({ data: [space], user });
    render(<OnboardingFlow user={user} />);
    await screen.findByText("Votre espace est prêt.");
    expect(mocks.attempt).not.toHaveBeenCalled();
    mocks.updateUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir mon espace" }));
    await screen.findByRole("alert");
    expect(mocks.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir mon espace" }));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(`/app/dashboard?workspace=${id}`),
    );
  });
  it("does not allow workspace creation after an unconfirmed membership read", async () => {
    mocks.request.mockResolvedValue({ data: [], user: { id: "other-user" } });
    render(<OnboardingFlow user={user} />);
    expect((await screen.findByRole("alert")).textContent).toContain("n’a pas été confirmé");
    expect(screen.queryByRole("button", { name: "Créer mon espace" })).toBeNull();
  });
  it("retains the attempt until the committed workspace is visible, then resumes on retry", async () => {
    render(<OnboardingFlow user={{ ...user, name: "Camille Martin" }} />);
    const input = await screen.findByLabelText("Nom de votre espace");
    fireEvent.change(input, { target: { value: space.name } });
    mocks.request.mockImplementation(async (path: string) =>
      path === "/api/onboarding" ? { id } : { data: [], user },
    );
    fireEvent.submit(input.closest("form")!);
    await screen.findByRole("alert");
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe(space.name);
    mocks.request.mockImplementation(async (path: string) =>
      path === "/api/onboarding" ? { id } : { data: [space], user },
    );
    fireEvent.submit(input.closest("form")!);
    await screen.findByText("Votre espace est prêt.");
    expect(mocks.confirm).toHaveBeenCalledOnce();
    const writes = mocks.request.mock.calls.filter(([path]) => path === "/api/onboarding");
    expect(writes).toHaveLength(2);
    expect(writes[0][2].attemptId).toBe(writes[1][2].attemptId);
  });
  it("opens the functional CSV importer and hides administrative actions for viewers", async () => {
    mocks.request.mockResolvedValue({ data: [space], user });
    render(<OnboardingFlow user={user} />);
    fireEvent.click(await screen.findByRole("button", { name: /Importer mes contacts/ }));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(`/app/people?import=1&workspace=${id}`),
    );
    cleanup();
    mocks.request.mockResolvedValue({ data: [{ ...space, role: "viewer" }], user });
    render(<OnboardingFlow user={user} />);
    await screen.findByText("Votre espace est prêt.");
    expect(screen.queryByRole("button", { name: /Inviter mon équipe/ })).toBeNull();
    expect(
      (screen.getByRole("button", { name: /Importer mes contacts/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
