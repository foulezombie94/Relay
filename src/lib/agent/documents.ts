import "server-only";
import { ApiError } from "@/lib/api/context";
const maxText = 200000;
export async function extractDocument(
  file: File,
  extension: string,
): Promise<{ text_content: string; extraction_status: "complete" | "partial" | "unavailable" }> {
  if (["txt", "csv"].includes(extension)) {
    const text = await file.text();
    return {
      text_content: text.slice(0, maxText),
      extraction_status: text.length <= maxText ? "complete" : "partial",
    };
  }
  if (extension !== "pdf") return { text_content: "", extraction_status: "unavailable" };
  const data = new Uint8Array(await file.arrayBuffer());
  if (Buffer.from(data.slice(0, 5)).toString() !== "%PDF-")
    throw new ApiError("Le contenu ne correspond pas à un PDF.");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data,
    useSystemFonts: false,
    disableFontFace: true,
    stopAtErrors: true,
  });
  let doc: Awaited<typeof task.promise> | undefined;
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        void task.destroy();
        reject(new ApiError("Extraction PDF trop longue.", 413));
      }, 10000);
      timer.unref();
    });
    doc = await Promise.race([task.promise, timeout]);
    if (doc.numPages > 300) throw new ApiError("PDF limité à 300 pages pour l’analyse.", 413);
    let text = "";
    const began = Date.now();
    let completed = true;
    for (let page = 1; page <= doc.numPages; page++) {
      if (Date.now() - began > 8000 || text.length >= maxText) {
        completed = false;
        break;
      }
      const content = await Promise.race([
        doc.getPage(page).then((p) => p.getTextContent()),
        timeout,
      ]);
      text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n";
    }
    return {
      text_content: text.slice(0, maxText),
      extraction_status:
        completed && text.length <= maxText && text.trim()
          ? "complete"
          : text.trim()
            ? "partial"
            : "unavailable",
    };
  } finally {
    clearTimeout(timer);
    await task.destroy();
  }
}
