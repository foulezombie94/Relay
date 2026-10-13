// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkflowDefinition } from "@/lib/domain/types";
import { WorkflowCanvas } from "./canvas";
import { ExecutionCanvas, type StepRun } from "./execution-canvas";

const definition: WorkflowDefinition = {
  object_id: "fixture",
  conditions: [],
  trigger: { type: "manual" },
  actions: [
    { id: "task", type: "task", title: "Préparer le dossier" },
    { id: "note", type: "note", title: "Enregistrer le bilan", body: "Note" },
  ],
};
const steps: StepRun[] = [
  {
    step_key: "root.0",
    position: 0,
    type: "task",
    title: "Préparer le dossier",
    status: "completed",
    completed_at: "2026-10-12T10:00:00Z",
    output: { entity_id: "fixture-result" },
  },
  {
    step_key: "root.1",
    position: 1,
    type: "note",
    title: "Enregistrer le bilan",
    status: "completed",
    completed_at: "2026-10-12T10:00:01Z",
    output: { status: "done" },
  },
];
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("selects a block, changes zoom/mode and opens the library from the keyboard", () => {
  const onSelect = vi.fn(),
    onAdd = vi.fn();
  render(<WorkflowCanvas definition={definition} onSelect={onSelect} onAdd={onAdd} />);
  fireEvent.click(screen.getByRole("button", { name: "Créer une tâche : Préparer le dossier" }));
  expect(onSelect.mock.calls[0][0].selection).toBe("task");
  fireEvent.click(screen.getByRole("button", { name: "Augmenter le zoom" }));
  expect(screen.getByText("110 %")).toBeDefined();
  const region = screen.getByRole("region", { name: "Canvas du workflow" });
  fireEvent.keyDown(region, { key: "h" });
  expect(
    screen.getByRole("button", { name: "Mode déplacement" }).getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.keyDown(region, { key: "b" });
  expect(onAdd).toHaveBeenCalledWith({});
  fireEvent.click(screen.getByRole("button", { name: "Ajouter après Préparer le dossier" }));
  expect(onAdd).toHaveBeenLastCalledWith({ after: "task" });
});

it("offers no editing tools in the run viewer", () => {
  render(
    <WorkflowCanvas
      definition={definition}
      steps={steps}
      runStatus="completed"
      onSelect={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: "Ajouter un bloc" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Organiser les blocs" })).toBeNull();
});

it("keeps dragged positions attached to the same action after reordering", () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  const onSelect = vi.fn(),
    onAdd = vi.fn();
  const { container, rerender } = render(
    <WorkflowCanvas definition={definition} onSelect={onSelect} onAdd={onAdd} />,
  );
  const region = screen.getByRole("region") as HTMLElement & {
    setPointerCapture: () => void;
    hasPointerCapture: () => boolean;
  };
  region.setPointerCapture = vi.fn();
  region.hasPointerCapture = () => false;
  fireEvent.pointerDown(
    screen.getByRole("button", { name: "Créer une tâche : Préparer le dossier" }),
    { button: 0, clientX: 20, clientY: 20 },
  );
  fireEvent.pointerMove(region, { clientX: 100, clientY: 60 });
  fireEvent.pointerUp(region);
  const moved = (container.querySelector('[data-node-key="root.0"]') as HTMLElement).style.left;
  expect(moved).not.toBe("356px");
  rerender(
    <WorkflowCanvas
      definition={{ ...definition, actions: [...definition.actions].reverse() }}
      onSelect={onSelect}
      onAdd={onAdd}
    />,
  );
  expect((container.querySelector('[data-node-key="root.1"]') as HTMLElement).style.left).toBe(
    moved,
  );
});

it("does not open the library or select a block while saving", () => {
  const onAdd = vi.fn(),
    onSelect = vi.fn();
  render(<WorkflowCanvas definition={definition} onSelect={onSelect} onAdd={onAdd} disabled />);
  fireEvent.keyDown(screen.getByRole("region"), { key: "b" });
  fireEvent.click(screen.getByRole("button", { name: "Créer une tâche : Préparer le dossier" }));
  expect(onAdd).not.toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();
});

it("replays the recorded path without network calls or new execution", () => {
  vi.useFakeTimers();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const { container } = render(
    <ExecutionCanvas definition={definition} steps={steps} runStatus="completed" />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Revoir le parcours" }));
  expect(container.querySelector('[data-replay="true"]')?.textContent).toContain(
    "Préparer le dossier",
  );
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(container.querySelector('[data-replay="true"]')?.textContent).toContain(
    "Enregistrer le bilan",
  );
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(screen.getByRole("button", { name: "Revoir le parcours" })).toBeDefined();
  expect(fetch).not.toHaveBeenCalled();
});

it("respects reduced motion and escapes external output", () => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
  const output = '<img src=x onerror="alert(1)">';
  const { container } = render(
    <ExecutionCanvas
      definition={definition}
      steps={[steps[0], { ...steps[1], output: { text: output } }]}
      runStatus="completed"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Revoir le parcours" }));
  expect(screen.queryByRole("button", { name: "Arrêter la relecture" })).toBeNull();
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toContain("onerror");
});

it("never displays another block’s output when the selected block has not been seeded", () => {
  render(<ExecutionCanvas definition={definition} steps={[steps[0]]} runStatus="running" />);
  fireEvent.click(screen.getByRole("button", { name: "Ajouter une note : Enregistrer le bilan" }));
  expect(screen.queryByText(/fixture-result/)).toBeNull();
  expect(screen.getByText(/Sélectionnez une action/)).toBeDefined();
});

it("centers and selects from the minimap and workflow outline without running anything", () => {
  const onSelect = vi.fn();
  render(<WorkflowCanvas definition={definition} onSelect={onSelect} />);
  fireEvent.keyDown(screen.getByRole("button", { name: "Centrer sur Préparer le dossier" }), {
    key: "Enter",
  });
  expect(onSelect.mock.calls[0][0].selection).toBe("task");
  fireEvent.click(screen.getByRole("button", { name: "Afficher le plan du workflow" }));
  fireEvent.click(screen.getByRole("button", { name: /3.*Enregistrer le bilan/ }));
  expect(onSelect.mock.calls[1][0].selection).toBe("note");
  expect(
    screen
      .getByRole("button", { name: "Afficher le plan du workflow" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
});

it("fits long workflows below 25 percent and restores readable zoom through the minimap", () => {
  render(
    <WorkflowCanvas
      definition={{
        ...definition,
        actions: Array.from({ length: 20 }, (_, i) => ({
          id: `task-${i}`,
          type: "task",
          title: `Tâche ${i}`,
        })),
      }}
      onSelect={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Ajuster le canvas" }));
  const percentage = screen.getByText(/^\d+ %$/).textContent!;
  expect(parseInt(percentage)).toBeLessThan(25);
  expect(parseInt(percentage)).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "Centrer sur Tâche 19" }));
  expect(screen.getByText("100 %")).toBeDefined();
});
