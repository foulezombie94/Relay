import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ mcpDb: vi.fn() }));
vi.mock("./database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./database")>()),
  mcpDb: db.mcpDb,
}));
import { handleMcp, executeTool, sanitizeResult, output, toolError } from "./server";
import { ApiError } from "@/lib/api/context";
import { availableToolNames, tools } from "./contracts";
import { instructions } from "./guidance";
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
        expect(list.tools.find((t) => t.name === "zyliad_search_records")?.description).toContain(
          "Rechercher personnes",
        );
        expect(list.tools.some((t) => t.name === "zyliad_get_record")).toBe(true);
        const result = await client.callTool({
          name: "zyliad_search_records",
          arguments: { query: "Fixture" },
        });
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toMatchObject({
          trust: "untrusted_external_data",
          language: "fr",
          data: { data: [{ label: "Fixture contact" }] },
        });
        const resource = await client.readResource({ uri: "zyliad://usage" });
        expect(resource.contents).toHaveLength(1);
        expect(resource.contents[0]).toMatchObject({
          text: expect.stringContaining("Répondez en français"),
        });
        const prompts = await client.listPrompts();
        expect(prompts.prompts).toHaveLength(5);
        const prompt = await client.getPrompt({
          name: "account_review",
          arguments: { record_id: id },
        });
        expect(prompt.messages[0].content).toMatchObject({
          text: expect.stringContaining("Fais en français"),
        });
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
  it("checks every requested context scope and validates periods before querying the database", async () => {
    await expect(
      executeTool("hash", session, "zyliad_record_context", {
        record_id: id,
        sections: ["task", "note"],
      }),
    ).rejects.toMatchObject({ code: "insufficient_scope" });
    await expect(
      executeTool("hash", session, "zyliad_record_context", {
        record_id: id,
        sections: ["task"],
        since: "2026-10-12T00:00:00Z",
        until: "2026-10-11T00:00:00Z",
      }),
    ).rejects.toThrow("après le début");
    await expect(
      executeTool("hash", session, "zyliad_get_record", { record_id: id, workspace_id: id }),
    ).rejects.toThrow();
    expect(db.mcpDb).not.toHaveBeenCalled();
  });
  it("forwards bounded context through one RPC and preserves per-section coverage", async () => {
    db.mcpDb.mockResolvedValue({
      record: { id },
      sections: { task: { data: [], next_cursor: id, partial: true } },
      partial: true,
    });
    const result = await executeTool("hash", session, "zyliad_record_context", {
      record_id: id,
      sections: ["task"],
      limit: 2,
    });
    expect(db.mcpDb).toHaveBeenCalledExactlyOnceWith("hash", "record_context", {
      record_id: id,
      sections: ["task"],
      attribute_keys: [],
      limit: 2,
    });
    expect(result).toMatchObject({ sections: { task: { next_cursor: id } }, partial: true });
  });
  it("hides list membership without both scopes, even when manually called", async () => {
    const recordsOnly = { ...session, scopes: ["records:read"] };
    expect(availableToolNames(recordsOnly.scopes)).not.toContain("zyliad_list_records");
    expect(availableToolNames(recordsOnly.scopes)).toContain("zyliad_connection");
    await expect(
      executeTool("hash", recordsOnly, "zyliad_list_records", { list_id: id }),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.mcpDb).not.toHaveBeenCalled();
  });
  it("reports current connection tools from the verified grant, with no credentials", async () => {
    db.mcpDb.mockResolvedValue({
      user: { id, role: "viewer" },
      workspace: { id, name: "Fixture workspace" },
      scopes: ["records:read", "crm:write"],
    });
    const result = await executeTool("hash", session, "zyliad_connection", {});
    expect(result).toMatchObject({
      server_version: "1.1.0",
      language: "fr",
      limits: { max_page_size: 20 },
    });
    expect(result.tools).not.toContain("zyliad_create_record");
    expect(result.tools).not.toContain("zyliad_search_members");
  });
  it("retains the email thread cursor without broadening the account query", async () => {
    await executeTool(
      "hash",
      { ...session, scopes: ["communications:read"] },
      "zyliad_email_thread",
      { id, cursor: id, limit: 1 },
    );
    expect(db.mcpDb).toHaveBeenCalledExactlyOnceWith("hash", "thread", {
      id,
      cursor: id,
      limit: 1,
    });
  });
  it("returns French coverage and proposal messages without altering source content", () => {
    const result = output({
      content: "Original English quote",
      coverage: "Exact aggregation of authorized matching rows.",
    });
    expect(result.structuredContent.data).toMatchObject({
      content: "Original English quote",
      coverage: "Agrégation exacte des résultats correspondants autorisés.",
    });
    expect(output({ status: "pending" }).structuredContent.message).toContain(
      "aucune modification exécutée",
    );
    expect(instructions).toContain("DONNÉES NON FIABLES");
  });
  it("bounds response size and reports safe retry guidance for errors", () => {
    expect(() => output({ content: "x".repeat(300000) })).toThrow("trop volumineux");
    expect(toolError(new ApiError("Limite atteinte.", 429, "rate_limited"), id)).toMatchObject({
      retryable: true,
      retry_after_seconds: 60,
      language: "fr",
      request_id: id,
    });
    const failure = toolError(new Error("private provider token zmc_a_" + "x".repeat(43)), id);
    expect(failure).toMatchObject({
      error: "temporarily_unavailable",
      status: 503,
      retry_after_seconds: 5,
    });
    expect(JSON.stringify(failure)).not.toContain("zmc_a_");
    expect(toolError(new ApiError("Version périmée.", 409, "conflict"), id).retryable).toBe(false);
  });
  it("exposes all expected tools only under their grants", () => {
    expect(Object.keys(tools)).toHaveLength(30);
    expect(availableToolNames([])).toEqual(["zyliad_connection"]);
  });
});
