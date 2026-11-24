// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PasswordInput, passwordStrength } from "./password-input";

afterEach(cleanup);
const field = () => document.querySelector("input") as HTMLInputElement;

describe("PasswordInput", () => {
  it("scores passwords from length and character variety", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("abc")).toBe(1);
    expect(passwordStrength("abcdefgh")).toBe(1);
    expect(passwordStrength("Abcdefgh1")).toBe(3);
    expect(passwordStrength("Abcdefgh1234!")).toBe(4);
  });
  it("keeps a real password input that forms and password managers can use", () => {
    render(
      <form>
        <PasswordInput name="password" required minLength={8} autoComplete="new-password" />
      </form>,
    );
    const input = field();
    expect(input.type).toBe("password");
    expect(input.name).toBe("password");
    expect(input.required).toBe(true);
    expect(input.autocomplete).toBe("new-password");
    fireEvent.change(input, { target: { value: "Secret123!" } });
    expect(new FormData(input.form!).get("password")).toBe("Secret123!");
  });
  it("shows and hides the password with a French toggle", () => {
    const onVisibleChange = vi.fn();
    render(<PasswordInput defaultValue="abc" onVisibleChange={onVisibleChange} />);
    const toggle = screen.getByRole("button", { name: "Afficher le mot de passe" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(field().type).toBe("text");
    expect(onVisibleChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("button", { name: "Masquer le mot de passe" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Masquer le mot de passe" }));
    expect(field().type).toBe("password");
  });
  it("reports typing to a controlled form and rates the new password", () => {
    const onChange = vi.fn();
    const { rerender } = render(<PasswordInput value="" onChange={onChange} />);
    fireEvent.change(field(), { target: { value: "Abcdefgh1234!" } });
    expect(onChange).toHaveBeenLastCalledWith("Abcdefgh1234!");
    rerender(<PasswordInput value="Abcdefgh1234!" onChange={onChange} />);
    expect(screen.getByText("Robustesse du mot de passe")).toBeTruthy();
    expect(screen.getByText("Fort")).toBeTruthy();
  });
  it("has no strength meter on a sign-in field", () => {
    render(<PasswordInput strength={false} defaultValue="Abcdefgh1234!" />);
    expect(screen.queryByText("Robustesse du mot de passe")).toBeNull();
  });
  it("cannot be revealed or typed in while disabled", () => {
    render(<PasswordInput disabled defaultValue="abc" />);
    expect(field().disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Afficher le mot de passe" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
