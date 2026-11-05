import { describe, expect, it } from "vitest";
import { automatedAgent, extractLinks, trackedHtml } from "./email-tracking";

describe("email tracking", () => {
  it("extracts unique links without trailing punctuation", () => {
    expect(
      extractLinks("Voir https://a.fr/x, puis https://a.fr/x. Et http://b.fr/y?z=1)."),
    ).toEqual(["https://a.fr/x", "http://b.fr/y?z=1"]);
  });
  it("escapes text, rewrites known links and appends the pixel", () => {
    const html = trackedHtml("Bonjour <b>Alice</b>\nhttps://a.fr/offre\nhttps://autre.fr", {
      links: ["https://a.fr/offre"],
      clickUrl: (p) => "https://crm.test/api/t/c/tok/" + p,
      pixelUrl: "https://crm.test/api/t/o/tok",
    });
    expect(html).toContain("Bonjour &lt;b&gt;Alice&lt;/b&gt;<br>");
    expect(html).toContain('<a href="https://crm.test/api/t/c/tok/1">https://a.fr/offre</a>');
    expect(html).toContain('<a href="https://autre.fr">https://autre.fr</a>');
    expect(html).toContain('<img src="https://crm.test/api/t/o/tok"');
  });
  it("leaves links untouched when clicks are not tracked", () => {
    const html = trackedHtml("https://a.fr", { links: [] });
    expect(html).toContain('<a href="https://a.fr">');
    expect(html).not.toContain("<img");
  });
  it("recognizes scanners and missing agents", () => {
    expect(automatedAgent(null)).toBe(true);
    expect(automatedAgent("Mozilla/5.0 (compatible; Barracuda Sentinel)")).toBe(true);
    expect(automatedAgent("Mozilla/5.0 (Windows NT 10.0) Chrome/130")).toBe(false);
  });
});
