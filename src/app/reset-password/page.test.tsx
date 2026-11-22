// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
  signOut: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  browserDb: () => ({ auth: { updateUser: mocks.updateUser, signOut: mocks.signOut } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
import ResetPassword from "./page";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.signOut.mockResolvedValue({ error: null });
});
afterEach(cleanup);
describe("password form network safety", () => {
  it("catches interrupted writes, retains input and clears busy", async () => {
    mocks.updateUser.mockRejectedValue(new TypeError("ECONNRESET secret"));
    render(<ResetPassword />);
    const password = screen.getByLabelText("Mot de passe") as HTMLInputElement;
    fireEvent.change(password, { target: { value: "test-password" } });
    fireEvent.change(screen.getByLabelText("Confirmez le mot de passe"), {
      target: { value: "test-password" },
    });
    fireEvent.submit(password.closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toContain("Connexion interrompue");
    expect(password.value).toBe("test-password");
    expect(password.disabled).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
  });
  it("rejects a mismatched confirmation before calling Auth", async () => {
    render(<ResetPassword />);
    const password = screen.getByLabelText("Mot de passe");
    fireEvent.change(password, { target: { value: "test-password" } });
    fireEvent.change(screen.getByLabelText("Confirmez le mot de passe"), {
      target: { value: "other-password" },
    });
    fireEvent.submit(password.closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toContain("ne correspondent pas");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("rejects empty fields before calling Auth", () => {
    render(<ResetPassword />);
    fireEvent.submit(screen.getByLabelText("Mot de passe").closest("form")!);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("requires an actual user confirmation, then closes every session before login", async () => {
    mocks.updateUser.mockResolvedValue({ data: { user: null }, error: null });
    render(<ResetPassword />);
    const password = screen.getByLabelText("Mot de passe");
    fireEvent.change(password, { target: { value: "test-password" } });
    fireEvent.change(screen.getByLabelText("Confirmez le mot de passe"), {
      target: { value: "test-password" },
    });
    fireEvent.submit(password.closest("form")!);
    await screen.findByRole("alert");
    expect(mocks.replace).not.toHaveBeenCalled();
    mocks.updateUser.mockResolvedValue({ data: { user: { id: "confirmed" } }, error: null });
    fireEvent.submit(password.closest("form")!);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "global" });
  });
});
