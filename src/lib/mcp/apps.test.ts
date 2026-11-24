import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ mcpDb: vi.fn() }));
vi.mock("./database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./database")>()),
  mcpDb: db.mcpDb,
}));
import { appMimeType, appUri, appViews, toolAppMeta, toolViews, widgetHtml } from "./apps";
import { handleMcp } from "./server";
import { tools, type ToolName } from "./contracts";

const id = "cf967873-7e4e-4d9a-b54b-8797f2583213";
beforeEach(() => {
  vi.stubEnv("APP_URL", "http://127.0.0.1:3000");
  vi.stubEnv("NEXT_PUBLIC_RELAY_ENVIRONMENT", "test");
  db.mcpDb.mockImplementation(async (_token, operation) =>
    operation === "session"
      ? { connection_id: id, workspace_id: id, scopes: ["records:read"], expires_at: "x" }
      : { data: [] },
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("MCP Apps interactive cards", () => {
  it("links every write tool to the proposal card and reads to their cards", () => {
    for (const [name, view] of Object.entries(toolViews)) {
      expect(Object.hasOwn(tools, name)).toBe(true);
      const meta = toolAppMeta(name as ToolName)!;
      expect(meta.ui.resourceUri).toBe(appUri(view));
      expect(meta["openai/outputTemplate"]).toBe(appUri(view));
    }
    for (const name of Object.keys(tools) as ToolName[])
      if ("action" in tools[name]) expect(toolViews[name]).toBe("proposal");
    expect(toolAppMeta("zyliad_connection")).toBeUndefined();
  });
  it("renders self-contained cards: no external resource, only Zyliad links", () => {
    for (const view of appViews) {
      const html = widgetHtml(view, "https://www.zyliad.online");
      expect(html.startsWith("<!doctype html>")).toBe(true);
      expect(html).toContain(`var VIEW="${view}"`);
      expect(html).not.toMatch(/<(?:script|link|img|iframe)[^>]+(?:src|href)=/i);
      // The SVG namespace is an identifier for createElementNS, never fetched.
      for (const url of html.match(/https?:\/\/[^\s"'<>)]+/g) ?? [])
        if (url !== "http://www.w3.org/2000/svg")
          expect(url.startsWith("https://www.zyliad.online")).toBe(true);
      // Values are written with textContent, never as HTML.
      expect(html).not.toContain("innerHTML");
    }
  });
  it("keeps the card script safe from an origin containing markup", () => {
    const html = widgetHtml("record", "https://x.example/</script><script>alert(1)</script>");
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });
  it("serves the cards as ui:// resources and links tools to them over MCP", async () => {
    const client = new Client({ name: "fixture-client", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL("http://127.0.0.1:3000/api/mcp"), {
      requestInit: { headers: { Authorization: "Bearer zmc_a_" + "a".repeat(43) } },
      fetch: async (url, init) => handleMcp(new Request(url, init)),
    });
    try {
      await client.connect(transport);
      const resources = await client.listResources();
      for (const view of appViews)
        expect(resources.resources).toContainEqual(
          expect.objectContaining({ uri: appUri(view), mimeType: appMimeType }),
        );
      const card = await client.readResource({ uri: appUri("proposal") });
      expect(card.contents[0]).toMatchObject({ mimeType: appMimeType });
      expect(String((card.contents[0] as { text?: string }).text)).toContain(
        "zyliad_confirm_command",
      );
      const list = await client.listTools();
      const tool = list.tools.find((t) => t.name === "zyliad_get_record");
      expect(tool?._meta).toMatchObject({ ui: { resourceUri: appUri("record") } });
    } finally {
      await client.close();
    }
  }, 15000);
});
