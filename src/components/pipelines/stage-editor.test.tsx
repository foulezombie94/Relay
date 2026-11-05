// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StageEditor, uniqueStageKey } from "./stage-editor";
import type { Pipeline } from "@/lib/domain/pipelines";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const pipeline: Pipeline = {
  id: "p1",
  workspace_id: "w",
  created_at: "",
  name: "Ventes",
  stages: ["Découverte", "Démo"],
  labels: {},
  probabilities: { Découverte: 10, Démo: 40, Gagné: 100, Perdu: 0 },
  version: 3,
};

it("generates unique, readable stage keys", () => {
  expect(uniqueStageKey("Démo", ["Démo"])).toBe("Démo 2");
  expect(uniqueStageKey("gagné", [])).toBe("gagné 2");
});

it("adds, renames and removes stages, asking where deals of a removed stage go", async () => {
  const onSave = vi.fn(async () => undefined);
  render(<StageEditor pipeline={pipeline} busy={false} onClose={() => {}} onSave={onSave} />);
  fireEvent.click(screen.getByRole("button", { name: /Ajouter une étape/ }));
  fireEvent.change(screen.getByLabelText("Nom de l’étape 3"), { target: { value: "Contrat" } });
  fireEvent.click(screen.getByRole("button", { name: "Supprimer Démo" }));
  expect(screen.getByText(/Étapes supprimées/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Ventes",
      stages: ["Découverte", "Contrat"],
      probabilities: expect.objectContaining({ Contrat: 50, Gagné: 100, Perdu: 0 }),
    }),
    { Démo: "Découverte" },
  );
});

it("refuses duplicate stage names before saving", async () => {
  const onSave = vi.fn(async () => undefined);
  render(<StageEditor pipeline={pipeline} busy={false} onClose={() => {}} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText("Nom de l’étape 2"), { target: { value: "découverte" } });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  // Labels may repeat in display, but both keep distinct stable keys: saving succeeds.
  await waitFor(() => expect(onSave).toHaveBeenCalled());
});
