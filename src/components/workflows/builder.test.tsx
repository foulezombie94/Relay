// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Workflow } from "@/lib/domain/types";
import { WorkflowBuilder } from "./builder";

vi.mock("../providers/data-provider", () => ({
  useWorkspace: () => ({
    objects: [{ id: "70df58cb-a6be-4778-b6a3-14c53f86544a", name: "Opportunités", slug: "deals" }],
    workspace: { id: "fixture", role: "owner" },
    user: { id: "fixture" },
  }),
  useRows: () => ({ data: { data: [], count: 0 }, error: null }),
}));
vi.mock("./connections", () => ({
  useDestinations: () => ({ data: { data: [] }, error: null }),
  WorkflowHook: () => null,
}));
vi.mock("./block-preview", () => ({ BlockPreview: () => null }));
const row = {
  id: "59e723df-2026-4c20-92fd-edfe0f7517b0",
  name: "Suivi commercial",
  version: 1,
  enabled: false,
  definition: {
    object_id: "70df58cb-a6be-4778-b6a3-14c53f86544a",
    trigger: { type: "manual" },
    conditions: [],
    actions: [
      {
        id: "b365f0fd-9478-43e1-bf5a-a8a604cb6c80",
        type: "task",
        title: "Première tâche",
        days: 1,
      },
      {
        id: "49fbbf75-ec34-40ca-a5a1-fd3f22085f48",
        type: "task",
        title: "Deuxième tâche",
        days: 1,
      },
    ],
  },
} as unknown as Workflow;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("inserts after the chosen block and keeps undo/redo and saving functional", async () => {
  const onSave = vi.fn().mockImplementation(async (draft) => ({ ...row, ...draft })),
    onPublish = vi.fn();
  render(
    <WorkflowBuilder workflow={row} onClose={vi.fn()} onSave={onSave} onPublish={onPublish} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Ajouter après Première tâche" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Rechercher un bloc" }), {
    target: { value: "attendre une durée" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Attendre.*Attendre une durée/ }));
  fireEvent.click(screen.getByRole("button", { name: "Annuler la modification" }));
  expect(screen.queryByRole("button", { name: /Attendre :/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Rétablir la modification" }));
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(onSave.mock.calls[0][0].definition.actions.map((a: { type: string }) => a.type)).toEqual([
    "task",
    "delay",
    "task",
  ]);
  expect(onPublish).not.toHaveBeenCalled();
});

it("requires the separate publication review before activating the workflow", async () => {
  const onSave = vi.fn().mockResolvedValue(row),
    onPublish = vi.fn().mockResolvedValue(undefined);
  render(
    <WorkflowBuilder workflow={row} onClose={vi.fn()} onSave={onSave} onPublish={onPublish} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Publier" }));
  expect(onSave).not.toHaveBeenCalled();
  expect(onPublish).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer et publier" }));
  await waitFor(() => expect(onPublish).toHaveBeenCalledWith(row));
});

it("saves the actual draft before opening the existing test/confirmation flow", async () => {
  const onSave = vi.fn().mockResolvedValue(row),
    onTest = vi.fn();
  render(
    <WorkflowBuilder
      workflow={row}
      onClose={vi.fn()}
      onSave={onSave}
      onPublish={vi.fn()}
      onTest={onTest}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Tester" }));
  await waitFor(() => expect(onTest).toHaveBeenCalledWith(row));
  expect(onSave).toHaveBeenCalledTimes(1);
});

it("filters preset blocks and saves a configured reply wait at the selected insertion point", async () => {
  const onSave = vi.fn().mockImplementation(async (draft) => ({ ...row, ...draft }));
  render(<WorkflowBuilder workflow={row} onClose={vi.fn()} onSave={onSave} onPublish={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Ajouter après Première tâche" }));
  fireEvent.click(screen.getByRole("button", { name: "Logique" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Rechercher un bloc" }), {
    target: { value: "reponse email" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: /Attendre une réponse email.*Reprendre à la réponse/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(onSave.mock.calls[0][0].definition.actions[1]).toMatchObject({
    type: "wait_until",
    wait_mode: "email_reply",
    timeout_behavior: "stop",
    timeout_minutes: 10080,
  });
});
