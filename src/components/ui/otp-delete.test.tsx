// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OtpInput } from "./otp-input";
import { DeleteButton } from "./delete-button";

afterEach(cleanup);

describe("OtpInput", () => {
  const slots = () => screen.getAllByRole("textbox") as HTMLInputElement[];

  it("fills digits one by one and completes the code", () => {
    const onChange = vi.fn();
    const onComplete = vi.fn();
    render(<OtpInput length={4} onChange={onChange} onComplete={onComplete} />);
    "1234"
      .split("")
      .forEach((digit, i) => fireEvent.change(slots()[i], { target: { value: digit } }));
    expect(onChange).toHaveBeenLastCalledWith("1234");
    expect(onComplete).toHaveBeenCalledExactlyOnceWith("1234");
  });
  it("ignores characters that do not match the type", () => {
    const onChange = vi.fn();
    render(<OtpInput length={4} onChange={onChange} />);
    fireEvent.change(slots()[0], { target: { value: "a" } });
    expect(onChange).not.toHaveBeenCalled();
  });
  it("spreads a pasted code across the slots", () => {
    const onComplete = vi.fn();
    render(<OtpInput length={6} onComplete={onComplete} />);
    fireEvent.paste(slots()[0], { clipboardData: { getData: () => "12 34-56" } });
    expect(onComplete).toHaveBeenCalledWith("123456");
  });
  it("clears the previous slot on backspace from an empty slot", () => {
    const onChange = vi.fn();
    render(<OtpInput length={4} defaultValue="12" onChange={onChange} />);
    fireEvent.keyDown(slots()[2], { key: "Backspace" });
    expect(onChange).toHaveBeenLastCalledWith("1");
  });
  it("labels each slot in French and exposes the error state", () => {
    render(<OtpInput length={6} status="error" label="Code de vérification" />);
    expect(screen.getByRole("group", { name: "Code de vérification" })).toBeTruthy();
    expect(slots()[0].getAttribute("aria-label")).toBe("Chiffre 1 sur 6");
    expect(slots()[0].getAttribute("aria-invalid")).toBe("true");
    expect(slots()[0].getAttribute("autocomplete")).toBe("one-time-code");
  });
});

describe("DeleteButton", () => {
  it("only deletes after the check mark is pressed", () => {
    const onConfirm = vi.fn();
    render(<DeleteButton label="Supprimer la réunion" onConfirm={onConfirm} />);
    const trigger = screen.getByRole("button", { name: "Supprimer la réunion" });
    fireEvent.click(trigger);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la suppression" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
  it("cancels with the cross, a second click on the bin or Escape", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<DeleteButton onConfirm={onConfirm} onCancel={onCancel} />);
    const trigger = screen.getByRole("button", { name: "Supprimer" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it("cannot be opened when disabled", () => {
    const onConfirm = vi.fn();
    render(<DeleteButton disabled onConfirm={onConfirm} />);
    const trigger = screen.getByRole("button", { name: "Supprimer" }) as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
    fireEvent.click(trigger);
    expect(screen.queryByRole("button", { name: "Confirmer la suppression" })).toBeNull();
  });
});
