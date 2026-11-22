// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
}));
vi.mock("@/lib/supabase/client", () => ({ browserDb: () => ({ auth: { signUp: mocks.signUp } }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.params }));
import { SignupFlow } from "./signup-flow";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = new URLSearchParams();
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
function enterPassword() {
  render(<SignupFlow />);
  fireEvent.change(screen.getByLabelText("Votre adresse email"), {
    target: { value: "camille@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continuer avec mon email" }));
  fireEvent.change(screen.getByLabelText("Mot de passe"), {
    target: { value: "a-unique-password" },
  });
  return screen.getByRole("button", { name: "Créer mon compte" });
}
describe("progressive signup without email verification", () => {
  it("validates the email before collecting a password or calling Auth", () => {
    render(<SignupFlow />);
    fireEvent.change(screen.getByLabelText("Votre adresse email"), {
      target: { value: "invalid" },
    });
    fireEvent.submit(screen.getByLabelText("Votre adresse email").closest("form")!);
    expect(screen.getByRole("alert").textContent).toContain("invalide");
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Mot de passe")).toBeNull();
  });
  it("opens onboarding immediately after a confirmed session", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: { user: { id: "user-a" } } }, error: null });
    fireEvent.click(enterPassword());
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/onboarding"));
    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "camille@example.test",
        options: expect.objectContaining({ data: { relay_onboarding_pending: true } }),
      }),
    );
    expect(screen.queryByText(/Vérifiez votre email/i)).toBeNull();
  });
  it("preserves invitation continuation and rejects external next URLs", async () => {
    mocks.params = new URLSearchParams("next=/invite");
    mocks.signUp.mockResolvedValue({ data: { session: { user: { id: "user-a" } } }, error: null });
    fireEvent.click(enterPassword());
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/invite"));
    cleanup();
    mocks.params = new URLSearchParams("next=https://evil.example");
    fireEvent.click(enterPassword());
    await waitFor(() => expect(mocks.replace).toHaveBeenLastCalledWith("/onboarding"));
  });
  it("asks a user without a session to confirm their email instead of signing them in", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: { id: "user-a" }, session: null },
      error: null,
    });
    fireEvent.click(enterPassword());
    expect(await screen.findByRole("heading", { name: "Votre espace vous attend." })).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
  it("retains input and prevents duplicate in-flight requests after an interrupted write", async () => {
    let reject: (error: Error) => void = () => {};
    mocks.signUp.mockReturnValue(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    const submit = enterPassword();
    fireEvent.submit(submit.closest("form")!);
    fireEvent.submit(submit.closest("form")!);
    expect(mocks.signUp).toHaveBeenCalledTimes(1);
    reject(new TypeError("private connection details"));
    expect((await screen.findByRole("alert")).textContent).toContain("Connexion interrompue");
    expect((screen.getByLabelText("Mot de passe") as HTMLInputElement).value).toBe(
      "a-unique-password",
    );
    expect(
      (screen.getByRole("button", { name: "Créer mon compte" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
