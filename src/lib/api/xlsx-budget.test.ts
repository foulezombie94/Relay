import { describe, expect, it, vi } from "vitest";
import { deflateRawSync, crc32 } from "node:zlib";
import { checkXlsxBudget } from "./xlsx-budget";
vi.mock("server-only", () => ({}));
import { readImportFile } from "./import-file";

// Build a ZIP with deliberately untrusted size metadata; no extractor is used.
function archive(entries: { name: string; body: Buffer; declared?: number }[]) {
  const local: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name),
      compressed = deflateRawSync(entry.body);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc32(entry.body), 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(entry.declared ?? entry.body.length, 22);
    header.writeUInt16LE(name.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(crc32(entry.body), 16);
    dir.writeUInt32LE(compressed.length, 20);
    dir.writeUInt32LE(entry.declared ?? entry.body.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    local.push(header, name, compressed);
    central.push(dir, name);
    offset += 30 + name.length + compressed.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
describe("bounded XLSX imports", () => {
  it("imports a genuine Excel workbook", async () => {
    const { Workbook } = await import("exceljs");
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet("Contacts");
    sheet.addRow(["Nom", "Email"]);
    sheet.addRow(["Alice", "alice@example.invalid"]);
    const data = await workbook.xlsx.writeBuffer();
    const table = await readImportFile(new File([data as ArrayBuffer], "contacts.xlsx"));
    expect(table).toEqual({
      headers: ["Nom", "Email"],
      rows: [["Alice", "alice@example.invalid"]],
      rowNumbers: [2],
    });
  }, 15000);
  it("rejects actual inflation even when declared ZIP sizes lie", async () => {
    const data = archive([
      {
        name: "xl/unused.xml",
        body: Buffer.alloc(9 * 1024 * 1024, 65),
        declared: 1,
      },
    ]);
    expect(data.length).toBeLessThan(5 * 1024 * 1024);
    await expect(checkXlsxBudget(data)).rejects.toThrow("décompression");
  }, 15000);
  it("bounds the combined expanded size of individually allowed entries", async () => {
    const data = archive(
      [0, 1, 2].map((n) => ({
        name: `xl/sheet${n}.xml`,
        body: Buffer.alloc(7 * 1024 * 1024, 65),
      })),
    );
    await expect(checkXlsxBudget(data)).rejects.toThrow("décompression");
  }, 15000);
  it("rejects a truncated directory without reading outside the upload", async () => {
    await expect(checkXlsxBudget(Buffer.from("PK"))).rejects.toThrow("Classeur");
    const data = archive([{ name: "xl/workbook.xml", body: Buffer.from("x") }]);
    await expect(checkXlsxBudget(data.subarray(0, data.length - 3))).rejects.toThrow("Classeur");
  });
});
