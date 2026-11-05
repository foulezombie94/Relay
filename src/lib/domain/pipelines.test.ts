import { describe, expect, it } from "vitest";
import {
  boardStages,
  dealProbability,
  pipelineInputSchema,
  pipelineSchema,
  pipelineStages,
  type Pipeline,
} from "./pipelines";

const saas = {
  id: "p1",
  workspace_id: "w",
  created_at: "",
  name: "SaaS",
  stages: ["Découverte", "Démo"],
  labels: { Gagné: "Signé" },
  probabilities: { Découverte: 15, Démo: 60, Gagné: 100, Perdu: 0 },
  version: 1,
} satisfies Pipeline;

describe("free pipeline stages", () => {
  it("orders open stages before the reserved terminal stages", () => {
    expect(pipelineStages(saas)).toEqual(["Découverte", "Démo", "Gagné", "Perdu"]);
    expect(pipelineStages(null)).toEqual([
      "Nouveau",
      "Qualification",
      "Proposition",
      "Négociation",
      "Gagné",
      "Perdu",
    ]);
  });
  it("keeps stages from other pipelines visible on a mixed board", () => {
    expect(boardStages(null, [{ stage: "Audit" }], [saas])).toEqual([
      "Découverte",
      "Démo",
      "Audit",
      "Gagné",
      "Perdu",
    ]);
  });
  it("uses the pipeline probability of a custom stage", () => {
    expect(
      dealProbability({ stage: "Démo", amount: 10, currency: "EUR", pipeline_id: "p1" }, [saas]),
    ).toBe(60);
  });
  it("validates names, duplicates, probabilities and reserved stages", () => {
    expect(pipelineInputSchema.safeParse(saas).success).toBe(true);
    expect(pipelineInputSchema.safeParse({ ...saas, stages: ["Démo", "démo"] }).success).toBe(
      false,
    );
    expect(pipelineInputSchema.safeParse({ ...saas, stages: ["Gagné"] }).success).toBe(false);
    expect(
      pipelineInputSchema.safeParse({
        ...saas,
        probabilities: { ...saas.probabilities, Gagné: 90 },
      }).success,
    ).toBe(false);
    expect(
      pipelineInputSchema.safeParse({ ...saas, stages: [...saas.stages, "Contrat"] }).success,
    ).toBe(false);
  });
  it("never injects defaults into a partial update", () => {
    expect(pipelineSchema.partial().parse({ name: "Renommé" })).toEqual({ name: "Renommé" });
  });
});
