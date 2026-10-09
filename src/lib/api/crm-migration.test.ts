import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { inspectImportFile } from "./import-file";
import { readZipEntries } from "./xlsx-budget";
import { crmSources, crmMapping, referenceIds } from "../domain/crm-migration";
import { prepareImport, csvTable } from "../domain/imports";
const objectId = "dc74c077-c8df-43c0-a01f-12d657a3aa77";
describe("CRM migration files", () => {
  it.each(crmSources.filter((s) => s.id !== "file").map((s) => s.id))(
    "maps and validates a %s company export",
    async (source) => {
      const bundle = await inspectImportFile(
        new File(
          ["Record ID,Company Name,Website\ncompany-1,Acme,https://acme.example\n"],
          "export.csv",
        ),
        { source },
      );
      const prepared = prepareImport(
        bundle.table!,
        crmMapping(bundle.table!.headers, "companies"),
        [],
        objectId,
        undefined,
        "dot",
        { sourceKey: source + ":test" },
      );
      expect(prepared.errors).toEqual([]);
      expect(prepared.valid[0]).toMatchObject({
        display_name: "Acme",
        domain: "acme.example",
        _import: { id: "company-1", source: source + ":test" },
      });
    },
  );
  it("preserves HubSpot association IDs and requires source identity", () => {
    const t = csvTable(
      "Record ID,First Name,Last Name,Email,Associated Company IDs\ncontact-1,Ada,Lovelace,ada@example.invalid,company-1;company-2",
    );
    const map: Record<string, string> = {
      ...crmMapping(t.headers, "people"),
      "First Name": "display_name",
    };
    const r = prepareImport(t, map, [], objectId, undefined, "dot", {
      sourceKey: "hubspot:test",
    });
    expect(r.valid[0]).toMatchObject({
      _import: { id: "contact-1", companies: ["company-1", "company-2"] },
    });
    delete map["Record ID"];
    expect(
      prepareImport(t, map, [], objectId, undefined, "dot", {
        sourceKey: "hubspot:test",
      }).errors[0].message,
    ).toContain("ID source");
  });
  it("offers Close nested collections without importing activity data and converts cents", async () => {
    const content = JSON.stringify([
      {
        id: "lead-1",
        name: "Acme",
        contacts: [
          {
            id: "contact-1",
            name: "Ada",
            emails: [{ email: "ada@example.invalid" }],
          },
        ],
        opportunities: [
          {
            id: "opp-1",
            name: "Renewal",
            value: 123456,
            value_currency: "USD",
            status: { label: "Negotiation" },
            confidence: 75,
          },
        ],
        activities: [{ secret: "not imported" }],
      },
    ]);
    const f = new File([content], "close.json");
    const catalog = await inspectImportFile(f, { source: "close" });
    expect(catalog.table).toBeNull();
    expect(catalog.selections).toHaveLength(3);
    const bundle = await inspectImportFile(f, {
      source: "close",
      selection: "2",
    });
    const prepared = prepareImport(
      bundle.table!,
      crmMapping(bundle.table!.headers, "deals"),
      [],
      objectId,
      undefined,
      "dot",
      {
        sourceKey: "close:test",
        deal: true,
        stageMap: { Negotiation: "Négociation" },
      },
    );
    expect(prepared.errors).toEqual([]);
    expect(prepared.valid[0]).toMatchObject({
      amount: "1234.56",
      currency: "USD",
      stage: "Négociation",
      _import: { id: "opp-1", companies: ["lead-1"] },
    });
    expect(bundle.table!.headers).not.toContain("activities");
  });
  it("allows choosing an Excel worksheet and header row; rejects formulas", async () => {
    const { Workbook } = await import("exceljs");
    const book = new Workbook();
    const a = book.addWorksheet("Companies");
    a.addRow(["Title"]);
    a.addRow(["ID", "Name"]);
    a.addRow(["c1", "Acme"]);
    const b = book.addWorksheet("Contacts");
    b.addRow(["Title"]);
    b.addRow(["First Name", "Last Name"]);
    b.addRow(["Ada", "Lovelace"]);
    const f = new File([(await book.xlsx.writeBuffer()) as ArrayBuffer], "monday.xlsx");
    expect((await inspectImportFile(f)).selections).toHaveLength(2);
    const r = await inspectImportFile(f, { selection: "1", headerRow: 2 });
    expect(r.table!.rows[0][0]).toBe("Ada Lovelace");
    b.getCell("A3").value = { formula: "1+1", result: 2 };
    await expect(
      inspectImportFile(new File([(await book.xlsx.writeBuffer()) as ArrayBuffer], "unsafe.xlsx"), {
        selection: "1",
        headerRow: 2,
      }),
    ).rejects.toThrow("formules");
  }, 15000);
  it("selects CSV tables from a real ZIP and refuses traversal / corruption", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("Companies.csv", "ID,Name\nc1,Acme");
    zip.file("People.csv", "ID,Name\np1,Ada");
    zip.file("attachment.pdf", "not imported");
    const data = await zip.generateAsync({ type: "nodebuffer" });
    const f = new File([new Uint8Array(data)], "attio.zip");
    const catalog = await inspectImportFile(f);
    expect(catalog.selections).toHaveLength(2);
    expect(catalog.ignored).toEqual(["attachment.pdf"]);
    expect((await inspectImportFile(f, { selection: "1" })).table!.rows).toEqual([["p1", "Ada"]]);
    const bad = new JSZip();
    bad.file("../secret.csv", "ID,Name\nc1,Acme");
    await expect(readZipEntries(await bad.generateAsync({ type: "nodebuffer" }))).rejects.toThrow();
    const corrupt = Buffer.from(data);
    corrupt[50] ^= 1;
    await expect(readZipEntries(corrupt)).rejects.toThrow();
  });
  it("bounds uploads, references and JSON shape; rejects prototype attribute payloads", async () => {
    await expect(
      inspectImportFile(new File([new Uint8Array(4_000_001)], "large.csv")),
    ).rejects.toThrow("4 Mo");
    await expect(inspectImportFile(new File(["[1,2]"], "bad.json"))).rejects.toThrow("objet");
    expect(() => referenceIds('["ok",42]')).toThrow();
    expect(() => referenceIds(Array.from({ length: 21 }, (_, i) => "id" + i).join(";"))).toThrow();
    const t = {
      headers: ["Name", "Attributes"],
      rows: [["Acme", '{"__proto__":{"admin":true}}']],
    };
    expect(
      prepareImport(
        t,
        { Name: "display_name", Attributes: "attributes" },
        [],
        objectId,
        undefined,
        "dot",
      ).errors,
    ).toHaveLength(1);
  });
  it("requires an explicit stage translation before accepting deals", () => {
    const t = csvTable("Name,Deal Stage\nRenewal,Contract sent");
    expect(
      prepareImport(t, crmMapping(t.headers, "deals"), [], objectId, undefined, "dot", {
        deal: true,
        stageMap: {},
      }).valid,
    ).toHaveLength(0);
    expect(
      prepareImport(t, crmMapping(t.headers, "deals"), [], objectId, undefined, "dot", {
        deal: true,
        stageMap: { "Contract sent": "Proposition" },
      }).valid[0],
    ).toMatchObject({ stage: "Proposition" });
  });
});
