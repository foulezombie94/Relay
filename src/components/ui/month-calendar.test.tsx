// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
