import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ mcpDb: vi.fn() }));
vi.mock("./database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./database")>()),
  mcpDb: db.mcpDb,
}));
import { handleMcp, executeTool, sanitizeResult } from "./server";
const id = "cf967873-7e4e-4d9a-b54b-8797f2583213";
const session = {
  connection_id: id,
  workspace_id: id,
  scopes: ["records:read", "tasks:read", "configuration:read"],
  expires_at: "2026-11-01T00:00:00Z",
};
beforeEach(() => {
  vi.stubEnv("APP_URL", "http://127.0.0.1:3000");
  vi.stubEnv("NEXT_PUBLIC_RELAY_ENVIRONMENT", "test");
  db.mcpDb.mockImplementation(async (_token, operation) =>
    operation === "session"
      ? session
      : { data: [{ id, label: "Fixture contact" }], partial: false },
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("official MCP SDK v2 transport", () => {
  for (const mode of ["auto", "legacy"] as const)
    it(`supports ${mode} negotiation and typed calls without shared session state`, async () => {
      const client = new Client(
        { name: "fixture-client", version: "1.0.0" },
        { versionNegotiation: { mode } },
      );
      const transport = new StreamableHTTPClientTransport(
        new URL("http://127.0.0.1:3000/api/mcp"),
        {
          requestInit: { headers: { Authorization: "Bearer zmc_a_" + "a".repeat(43) } },
          fetch: async (url, init) => handleMcp(new Request(url, init)),
        },
      );
      try {
        await client.connect(transport);
        expect(client.getProtocolEra()).toBe(mode === "auto" ? "modern" : "legacy");
        const list = await client.listTools();
        expect(list.tools.some((t) => t.name === "zyliad_search_records")).toBe(true);
        expect(list.tools.some((t) => t.name === "zyliad_create_record")).toBe(false);
        const result = await client.callTool({
          name: "zyliad_search_records",
          arguments: { query: "Fixture" },
        });
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toMatchObject({
          trust: "untrusted_external_data",
          data: { data: [{ label: "Fixture contact" }] },
        });
        const resource = await client.readResource({ uri: "zyliad://usage" });
        expect(resource.contents).toHaveLength(1);
      } finally {
        await client.close();
      }
    }, 15000);
  it("uses the actual HTTP Host despite an internal Next.js listening address", async () => {
    const response = await handleMcp(
      new Request("http://localhost:3000/api/mcp", { headers: { host: "127.0.0.1:3000" } }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("oauth-protected-resource/api/mcp");
    expect(db.mcpDb).not.toHaveBeenCalled();
  });
  it("rejects foreign origins before any token verification", async () => {
    const result = await handleMcp(
      new Request("http://127.0.0.1:3000/api/mcp", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
        body: "{}",
      }),
    );
    expect(result.status).toBe(403);
    expect(db.mcpDb).not.toHaveBeenCalled();
  });
  it("requires the source-specific scope and never executes a missing-scope action", async () => {
    await expect(
      executeTool("hash", session, "zyliad_read_source", { kind: "email", id }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      executeTool("hash", session, "zyliad_create_task", {
        request_id: id,
        values: { title: "Unauthorized task" },
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.mcpDb).not.toHaveBeenCalled();
  });
  it("only prepares writes and returns the real confirmation destination", async () => {
    db.mcpDb.mockResolvedValue({ id, status: "pending" });
    const result = await executeTool(
      "hash",
      { ...session, scopes: [...session.scopes, "crm:write"] },
      "zyliad_create_task",
      { request_id: id, values: { title: "Follow up" } },
    );
    expect(result).toMatchObject({
      status: "pending",
      confirmation_url: "http://127.0.0.1:3000/app/settings#developpeurs",
    });
    expect(db.mcpDb).toHaveBeenCalledWith(
      "hash",
      "prepare",
      expect.objectContaining({ action: "create_task", request_id: id }),
    );
  });
  it("redacts credential fields and recognizable tokens nested in CRM data", () => {
    const token = "zmc_a_" + "x".repeat(43);
    const clean = JSON.stringify(
      sanitizeResult({
        email: "person@example.invalid",
        attributes: { api_key: token },
        content: "Untrusted note " + token,
      }),
    );
    expect(clean).not.toContain(token);
    expect(clean).toContain("person@example.invalid");
    expect(clean).toContain("[REDACTED]");
  });
});
