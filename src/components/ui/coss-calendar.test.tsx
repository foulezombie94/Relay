// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { format } from "date-fns";
import { DatePicker } from "./coss-calendar";

afterEach(cleanup);
const hidden = (name: string) =>
  document.querySelector(`input[type=hidden][name=${name}]`) as HTMLInputElement;

describe("coss DatePicker", () => {
  it("submits the same format as a datetime-local field", () => {
    render(
      <DatePicker name="due_date" label="Échéance" withTime defaultValue="2026-11-25T14:30" />,
    );
    expect(hidden("due_date").value).toBe("2026-11-25T14:30");
    expect(screen.getByRole("button", { name: /Échéance/ }).textContent).toContain(
      "25 nov. 2026 à 14:30",
    );
  });
  it("starts empty with a placeholder", () => {
    render(<DatePicker name="due_date" label="Échéance" withTime />);
    expect(hidden("due_date").value).toBe("");
    expect(screen.getByRole("button", { name: /aucune date/ }).textContent).toContain(
      "Choisir une date",
    );
  });
  it("sets tomorrow at 09:00 from a quick date, keeps the time, then clears", async () => {
    const onValueChange = vi.fn();
    render(<DatePicker name="due_date" label="Échéance" withTime onValueChange={onValueChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Échéance/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Demain" }));
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const expected = format(tomorrow, "yyyy-MM-dd") + "T09:00";
    expect(hidden("due_date").value).toBe(expected);
    expect(onValueChange).toHaveBeenLastCalledWith(expected);
    // The French month and year menus (coss p-calendar-4) are available.
    expect(screen.getByLabelText("Choisir le mois")).toBeTruthy();
    expect(screen.getByLabelText("Choisir l'année")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Heure"), { target: { value: "16:45" } });
    expect(hidden("due_date").value).toBe(format(tomorrow, "yyyy-MM-dd") + "T16:45");
    fireEvent.click(screen.getByRole("button", { name: "Effacer" }));
    expect(hidden("due_date").value).toBe("");
  });
  it("submits a plain date without time", () => {
    render(<DatePicker name="close_date" label="Clôture" defaultValue="2026-12-31" />);
    expect(hidden("close_date").value).toBe("2026-12-31");
  });
});
