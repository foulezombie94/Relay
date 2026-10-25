// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RecordQuickPeek } from "./quick-peek";
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("opens a compact centered preview and exposes editing only when authorized", () => {
  const record = {
    id: "r",
    display_name: "Projet Atlas",
    amount: 2400,
    currency: "EUR",
    stage: "Qualification",
    close_date: "2026-10-06",
  };
  const onClose = vi.fn(),
    onEdit = vi.fn();
  const view = render(<RecordQuickPeek record={record} onClose={onClose} />);
  const dialog = screen.getByRole("dialog", { name: "Projet Atlas" });
  expect(dialog.classList.contains("dialog-content")).toBe(true);
  expect(dialog.classList.contains("drawer")).toBe(false);
  expect(screen.getByText("6 octobre 2026")).toBeDefined();
  expect(screen.queryByRole("button", { name: "Modifier" })).toBeNull();
  view.rerender(<RecordQuickPeek record={record} onClose={onClose} onEdit={onEdit} />);
  fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
  expect(onEdit).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
