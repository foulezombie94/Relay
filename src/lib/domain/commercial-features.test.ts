import { describe, it, expect } from "vitest";
import {
  csvTable,
  automaticMapping,
  prepareImport,
  importedNumber,
} from "./imports";
import { forecastDeals, type Pipeline } from "./pipelines";
import { emailTemplateSchema, renderEmailTemplate } from "./email-templates";
const objectId = "11111111-1111-4111-8111-111111111111";
describe("import validation before database writes", () => {
  it("maps French headers and validates dates and decimal numbers", () => {
    const table = csvTable(
      "Nom;Montant;Devise;Date de clôture\nContrat A;1 234,56;eur;31/10/2026",
    );
    const result = prepareImport(
      table,
      automaticMapping(table.headers),
      [],
      objectId,
      undefined,
      "comma",
    );
    expect(result.errors).toEqual([]);
    expect(result.valid[0]).toMatchObject({
      display_name: "Contrat A",
      amount: "1234.56",
      currency: "EUR",
      close_date: "2026-10-31",
    });
  });
  it("rejects duplicate mappings and impossible dates", () => {
    const table = csvTable(
      "Nom;Email;Date\nAlice;alice@example.com;31/02/2026",
    );
    expect(() =>
      prepareImport(
        table,
        { Nom: "display_name", Email: "display_name", Date: "" },
        [],
        objectId,
        undefined,
        "comma",
      ),
    ).toThrow("deux colonnes");
    expect(
      prepareImport(
        table,
        { Nom: "display_name", Email: "email", Date: "close_date" },
        [],
        objectId,
        undefined,
        "comma",
      ).errors,
    ).toHaveLength(1);
  });
  it("requires a loss reason and rejects an overlong record name", () => {
    const table = csvTable(
      "Nom;Étape\nContrat A;Perdu\n" + "a".repeat(201) + ";Nouveau",
    );
    const result = prepareImport(
      table,
      automaticMapping(table.headers),
      [],
      objectId,
      undefined,
      "comma",
    );
    expect(result.valid).toHaveLength(0);
    expect(result.errors).toHaveLength(2);
  });
  it("does not silently treat a comma decimal as a thousands separator", () => {
    expect(() => importedNumber("1,000", "comma")).toThrow();
    expect(importedNumber("1,000.25", "dot")).toBe("1000.25");
    expect(() => csvTable("Nom;Nom\na;b")).toThrow("unique");
  });
});
describe("forecast calculations", () => {
  const pipeline: Pipeline = {
    id: objectId,
    workspace_id: objectId,
    created_at: "2026-10-06T00:00:00Z",
    name: "Test",
    labels: {},
    version: 1,
    probabilities: { Nouveau: 10, Qualification: 25 },
  };
  it("honors deal overrides, includes zero probability and keeps currencies separate", () => {
    const result = forecastDeals(
      [
        {
          stage: "Qualification",
          amount: 100,
          currency: "EUR",
          pipeline_id: objectId,
          close_date: "2026-10-20",
        },
        {
          stage: "Qualification",
          amount: 100,
          currency: "EUR",
          pipeline_id: objectId,
          probability: 0,
        },
        { stage: "Nouveau", amount: 200, currency: "USD", probability: 50 },
      ],
      [pipeline],
    );
    expect(result.EUR.open).toBe(200);
    expect(result.EUR.weighted).toBe(25);
    expect(result.USD.weighted).toBe(100);
    expect(result.EUR.months["2026-10"].weighted).toBe(25);
    expect(result.EUR.months["Sans date"].weighted).toBe(0);
  });
  it("excludes terminal deals from the open forecast", () => {
    const result = forecastDeals(
      [
        { stage: "Gagné", amount: 100, currency: "EUR", probability: 10 },
        {
          stage: "Perdu",
          amount: 300,
          currency: "EUR",
          probability: 100,
          lost_reason: "Budget",
        },
      ],
      [],
    );
    expect(result.EUR.open).toBe(0);
    expect(result.EUR.weighted).toBe(0);
    expect(result.EUR.won).toBe(100);
    expect(result.EUR.reasons.Budget).toBe(1);
  });
});
describe("email template rendering", () => {
  it("reports missing values without silently deleting them", () => {
    expect(
      renderEmailTemplate("Bonjour {{name}}, {{workspace}}", { name: "Alice" }),
    ).toEqual({ text: "Bonjour Alice, {{workspace}}", missing: ["workspace"] });
  });
  it("rejects unsupported template expressions", () => {
    expect(
      emailTemplateSchema.safeParse({
        name: "Test",
        subject: "Bonjour {{name}}",
        body: "{{secret}}",
      }).success,
    ).toBe(false);
  });
});
