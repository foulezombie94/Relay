// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { widgetHtml, type AppView } from "./apps";

// jsdom ships without type definitions; only this constructor is used.
type CardWindow = Window & typeof globalThis;
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (
    html: string,
    options: { runScripts: "dangerously"; beforeParse: (window: CardWindow) => void },
  ) => { window: CardWindow };
};

const origin = "https://www.zyliad.online";
const id = "cfa2bc1d-9498-498b-9ec8-c0b8f22e95ed";

/** Runs one card in a simulated browser and delivers a tool result as the host would. */
function card(view: AppView, result: unknown, input: unknown = {}) {
  // The card posts to its host (here itself): those messages are dropped, as no host listens.
  const dom = new JSDOM(widgetHtml(view, origin), {
    runScripts: "dangerously",
    beforeParse: (window) => {
      window.postMessage = (() => {}) as typeof window.postMessage;
    },
  });
  const { window } = dom;
  const post = (data: unknown) =>
    window.dispatchEvent(new window.MessageEvent("message", { data, source: window }));
  post({ jsonrpc: "2.0", method: "ui/notifications/tool-input", params: { arguments: input } });
  post({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: result });
  return window.document.getElementById("root")!;
}
const structured = (data: unknown) => ({
  structuredContent: { trust: "untrusted_external_data", language: "fr", message: "", data },
});
const textOnly = (data: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(structured(data).structuredContent) }],
});
const search = {
  data: [
    {
      id,
      type: "record",
      label: "NIKE",
      content: JSON.stringify({ stage: "Nouveau", email: "contact@nike.example", amount: 0 }),
      record_id: id,
    },
  ],
  total: 1,
  partial: false,
  next_cursor: null,
};

describe("MCP App cards render real tool results", () => {
  it("lists search results with their details, from structured or text-only results", () => {
    for (const result of [structured(search), textOnly(search)]) {
      const root = card("results", result);
      expect(root.textContent).toContain("1 fiche");
      expect(root.textContent).toContain("NIKE");
      expect(root.textContent).toContain("Nouveau");
      expect(root.textContent).toContain("contact@nike.example");
      expect(root.textContent).not.toContain("Aucune fiche");
    }
  });
  it("keeps the id and name from the content when the wrapper has none", () => {
    const root = card(
      "results",
      structured({
        data: [{ content: JSON.stringify({ id, display_name: "Acme", stage: "Client" }) }],
      }),
    );
    expect(root.textContent).toContain("Acme");
    expect(root.textContent).not.toContain("undefined");
    expect(root.textContent).not.toContain("Sans nom");
    // "Choisir" sends the record id kept from the content, never "undefined".
    const sent: { method?: string; params?: { content?: { text?: string } } }[] = [];
    const win = root.ownerDocument.defaultView!;
    win.postMessage = ((m: (typeof sent)[number]) => sent.push(m)) as typeof win.postMessage;
    [...root.querySelectorAll("button")].find((b) => b.textContent === "Choisir")!.click();
    const message = sent.find((m) => m.method === "ui/message");
    expect(message?.params?.content?.text).toContain(id);
    expect(message?.params?.content?.text).not.toContain("undefined");
  });
  it("shows a single total as figures", () => {
    const root = card(
      "pipeline",
      textOnly({
        data: [
          { count: 1, amount: "0.00", currency: "EUR", dimension: "all", average_amount: "0" },
        ],
        groups: 1,
        partial: false,
      }),
    );
    expect(root.textContent).toContain("Éléments");
    expect(root.textContent).toContain("Montant total");
    expect(root.textContent).not.toContain("Aucune donnée");
  });
  it("shows a pending proposal with readable names and its decision buttons", () => {
    const root = card(
      "proposal",
      structured({
        id,
        status: "pending",
        action: "create_record",
        values: { object_id: "23c88c34-9bec-47d6-a803-b30f147e51a4", display_name: "Apple" },
        labels: { object_id: "Entreprises" },
      }),
    );
    expect(root.textContent).toContain("Apple");
    expect(root.textContent).toContain("Entreprises");
    expect(root.textContent).not.toContain("23c88c34");
    const buttons = [...root.querySelectorAll("button")].map((b) => b.textContent);
    expect(buttons).toEqual(expect.arrayContaining(["Annuler", "Confirmer"]));
  });
  it("reports a failed tool call without crashing", () => {
    const root = card("record", { isError: true, content: [{ type: "text", text: "{}" }] });
    expect(root.textContent).toContain("n’a pas abouti");
  });
});
