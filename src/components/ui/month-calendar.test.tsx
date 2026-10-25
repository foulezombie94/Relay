// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { List, CalendarDays } from "lucide-react";
import { MonthCalendar, calendarDate } from "./month-calendar";
import { ViewButtons } from "./view-buttons";
import { normalizeView } from "@/lib/domain/views";
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("moves focus among view buttons without applying a view until activation", () => {
  const change = vi.fn();
  render(
    <ViewButtons
      label="Vues"
      value="list"
      options={[
        { value: "list", label: "Liste", icon: List },
        { value: "calendar", label: "Calendrier", icon: CalendarDays },
      ]}
      onChange={change}
    />,
  );
  const list = screen.getByRole("button", { name: "Liste" });
  const calendar = screen.getByRole("button", { name: "Calendrier" });
  fireEvent.keyDown(list, { key: "ArrowRight" });
  expect(document.activeElement).toBe(calendar);
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(calendar);
  expect(change).toHaveBeenCalledExactlyOnceWith("calendar");
});
it("places leap day accurately, opens the original record and crosses the year boundary", () => {
  const open = vi.fn();
  const items = [
    { id: "leap", title: "Clôture Atlas", date: "2024-02-29" },
    { id: "missing", title: "Sans date", date: null },
  ];
  const view = render(
    <MonthCalendar initialMonth={new Date(2024, 1, 1)} items={items} onOpen={open} />,
  );
  const event = screen.getByRole("button", { name: "Clôture Atlas" });
  expect(event.closest("td")?.querySelector("time")?.dateTime).toBe("2024-02-29");
  fireEvent.click(event);
  expect(open).toHaveBeenCalledExactlyOnceWith("leap");
  view.rerender(<MonthCalendar items={[]} onOpen={open} />);
  expect(screen.queryByRole("button", { name: "Clôture Atlas" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Mois précédent" }));
  fireEvent.click(screen.getByRole("button", { name: "Mois précédent" }));
  expect(screen.getByRole("table", { name: "décembre 2023" })).toBeDefined();
});
it("rejects impossible dates and preserves the saved calendar layout", () => {
  expect(calendarDate("2026-02-29")).toBeNull();
  expect(calendarDate("2026-09-31")).toBeNull();
  expect(calendarDate("2026-09-22T00:00:00Z")).toBeNull();
  expect(calendarDate("2024-02-29")).toBeInstanceOf(Date);
  expect(normalizeView({ layout: "calendar" }, true).layout).toBe("calendar");
});
it("keeps 47 records compact and opens every hidden record from the daily list", async () => {
  const open = vi.fn();
  const items = Array.from({ length: 47 }, (_, i) => ({
    id: `r-${i}`,
    title: `Projet ${i + 1}`,
    date: "2026-10-06",
  }));
  const view = render(
    <MonthCalendar initialMonth={new Date(2026, 9, 1)} items={items} onOpen={open} />,
  );
  const more = screen.getByRole("button", { name: "Afficher les 47 éléments du 6 octobre 2026" });
  const cell = more.closest("td")!;
  expect(within(cell).getAllByRole("button")).toHaveLength(3);
  expect(screen.queryByRole("button", { name: "Projet 47" })).toBeNull();
  fireEvent.click(more);
  const list = await screen.findByRole("region", { name: "Liste du 6 octobre 2026" });
  expect(within(list).getAllByRole("button")).toHaveLength(47);
  const search = screen.getByRole("searchbox", { name: "Rechercher dans cette journée" });
  fireEvent.change(search, { target: { value: "Projet 47" } });
  expect(within(list).getAllByRole("button")).toHaveLength(1);
  expect(screen.getByRole("status").textContent).toContain("1 résultat sur 47");
  fireEvent.change(search, { target: { value: "absent" } });
  expect(within(list).queryAllByRole("button")).toHaveLength(0);
  expect(within(list).getByText("Aucune fiche ne correspond à votre recherche.")).toBeDefined();
  fireEvent.change(search, { target: { value: "Projet 47" } });
  fireEvent.click(within(list).getByRole("button", { name: "Projet 47" }));
  expect(open).toHaveBeenCalledExactlyOnceWith("r-46");
  expect(screen.queryByRole("region", { name: "Liste du 6 octobre 2026" })).toBeNull();
  fireEvent.click(more);
  await screen.findByRole("region", { name: "Liste du 6 octobre 2026" });
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
  view.rerender(<MonthCalendar items={[]} onOpen={open} />);
  expect(screen.queryByRole("button", { name: "Projet 47" })).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});
