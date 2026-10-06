import { inflateRaw } from "node:zlib";
import { promisify } from "node:util";

const inflate = promisify(inflateRaw);
const MAX_ENTRY = 8 * 1024 * 1024;
const MAX_TOTAL = 20 * 1024 * 1024;
const invalid = () => new Error("Classeur invalide ou trop volumineux après décompression (20 Mo maximum).");

/** Validate ZIP structure and actual inflated sizes before ExcelJS accumulates entries. */
export async function checkXlsxBudget(data: Buffer) {
  let end = -1;
  for (let p = data.length - 22; p >= Math.max(0, data.length - 65557); p--) {
    if (data.readUInt32LE(p) === 0x06054b50 && p + 22 + data.readUInt16LE(p + 20) === data.length) { end = p; break; }
  }
  if (end < 0) throw invalid();
  const count = data.readUInt16LE(end + 10);
  const directorySize = data.readUInt32LE(end + 12);
  let offset = data.readUInt32LE(end + 16);
  // ZIP64, encryption and multi-disk archives are unnecessary for small CRM imports.
  if (data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6) ||
      data.readUInt16LE(end + 8) !== count || !count || count > 256 ||
      offset + directorySize !== end) throw invalid();
  let total = 0;
  const names = new Set<string>();
  for (let n = 0; n < count; n++) {
    if (offset + 46 > end || data.readUInt32LE(offset) !== 0x02014b50) throw invalid();
    const flags = data.readUInt16LE(offset + 8), method = data.readUInt16LE(offset + 10);
    const compressed = data.readUInt32LE(offset + 20), declared = data.readUInt32LE(offset + 24);
    const nameLength = data.readUInt16LE(offset + 28), extra = data.readUInt16LE(offset + 30), comment = data.readUInt16LE(offset + 32);
    const local = data.readUInt32LE(offset + 42);
    if (offset + 46 + nameLength + extra + comment > end || flags & 1 ||
        ![0,8].includes(method) || declared > MAX_ENTRY || local + 30 > data.readUInt32LE(end + 16) ||
        data.readUInt32LE(local) !== 0x04034b50 || data.readUInt16LE(offset + 34) !== 0) throw invalid();
    const name = data.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (!name || names.has(name) || name.includes("\\") || name.startsWith("/") || name.split("/").includes("..")) throw invalid();
    names.add(name);
    const localName = data.readUInt16LE(local + 26), localExtra = data.readUInt16LE(local + 28);
    const start = local + 30 + localName + localExtra;
    if (start + compressed > data.readUInt32LE(end + 16) ||
        data.readUInt16LE(local + 6) !== flags || data.readUInt16LE(local + 8) !== method ||
        !data.subarray(local + 30, local + 30 + localName).equals(data.subarray(offset + 46, offset + 46 + nameLength))) throw invalid();
    const input = data.subarray(start, start + compressed);
    try {
      const outputSize = method === 0 ? input.length : (await inflate(input, {maxOutputLength: Math.min(MAX_ENTRY, MAX_TOTAL-total)})).length;
      total += outputSize;
      if (outputSize !== declared || outputSize > MAX_ENTRY || total > MAX_TOTAL) throw invalid();
    } catch { throw invalid(); }
    offset += 46 + nameLength + extra + comment;
  }
  if (offset !== end || !names.has("[Content_Types].xml") || !names.has("xl/workbook.xml")) throw invalid();
}
