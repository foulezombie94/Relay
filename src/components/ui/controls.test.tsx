// @vitest-environment jsdom
import React, { useState } from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Table2, Columns3 } from "lucide-react";
import { VisualPicker } from "./controls";
import { SlideViewer } from "./slide-viewer";
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("opens a view picker without applying a change, then applies only an explicit selection", async () => {
  const change = vi.fn();
  render(
    <VisualPicker
      label="Présentation"
      value="table"
      options={[
        { value: "table", label: "Table", icon: Table2 },
        { value: "board", label: "Kanban", icon: Columns3 },
      ]}
      onChange={change}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Présentation" }));
  expect(change).not.toHaveBeenCalled();
  const board = await screen.findByRole("button", { name: "Kanban" });
  fireEvent.keyDown(board, { key: "ArrowLeft" });
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(board);
  expect(change).toHaveBeenCalledExactlyOnceWith("board");
  expect(screen.queryByRole("group", { name: "Choix : Présentation" })).toBeNull();
});
it("navigates slides within bounds and does not intercept input keys", () => {
  function Deck() {
    const [index, setIndex] = useState(0);
    return (
      <SlideViewer
        open
        index={index}
        onIndexChange={setIndex}
        onClose={vi.fn()}
        slides={[
          { id: "a", title: "Pipeline", content: <input aria-label="Filtre" /> },
          { id: "b", title: "Activité", content: <p>Deuxième bloc</p> },
        ]}
      />
    );
  }
  render(<Deck />);
  expect(
    (screen.getByRole("button", { name: "Diapositive précédente" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Filtre" }), { key: "ArrowRight" });
  expect(screen.getByRole("heading", { name: "Pipeline" })).toBeDefined();
  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(screen.getByRole("heading", { name: "Activité" })).toBeDefined();
  expect(
    (screen.getByRole("button", { name: "Diapositive suivante" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.keyDown(window, { key: "Home" });
  expect(screen.getByRole("heading", { name: "Pipeline" })).toBeDefined();
});
it("stops rendering slides when the authorized data set is withdrawn", () => {
  const props = { open: true, index: 0, onIndexChange: vi.fn(), onClose: vi.fn() };
  const view = render(
    <SlideViewer
      {...props}
      slides={[
        { id: "private", title: "Données autorisées", content: <p>Valeur confidentielle</p> },
      ]}
    />,
  );
  expect(screen.getByText("Valeur confidentielle")).toBeDefined();
  view.rerender(<SlideViewer {...props} slides={[]} />);
  expect(screen.queryByText("Valeur confidentielle")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});
