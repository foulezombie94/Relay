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
import { appConfirmedActions, availableToolNames, tools } from "./contracts";
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
        // Every tool is listed (step-up); a missing scope is requested at call time.
        expect(list.tools.find((t) => t.name === "zyliad_create_record")?.description).toContain(
          "permission supplémentaire",
        );
        expect(list.tools.find((t) => t.name === "zyliad_search_records")?.title).toBe(
          "Rechercher des fiches",
        );
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
      confirmation_url: `http://127.0.0.1:3000/app/settings?mcp_command=${id}#developpeurs`,
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
      server_version: "1.4.4",
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
    // New companies are completed from public sources, never invented.
    expect(instructions).toContain("site officiel");
    expect(instructions).toContain("n’inventez jamais");
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
  it("approves or rejects a proposal from the MCP client with the connection token", async () => {
    const writer = { ...session, scopes: ["crm:write"] };
    db.mcpDb.mockResolvedValueOnce({ id, status: "executed", record_id: id });
    await expect(
      executeTool("hash", writer, "zyliad_confirm_command", { id, decision: "approve" }),
    ).resolves.toMatchObject({ status: "executed" });
    expect(db.mcpDb).toHaveBeenLastCalledWith("hash", "approve", { command_id: id });
    db.mcpDb.mockResolvedValueOnce({ id, status: "rejected" });
    await executeTool("hash", writer, "zyliad_confirm_command", { id, decision: "reject" });
    expect(db.mcpDb).toHaveBeenLastCalledWith("hash", "reject", { command_id: id });
    await expect(
      executeTool("hash", writer, "zyliad_confirm_command", { id, decision: "delete" }),
    ).rejects.toThrow();
    await expect(
      executeTool("hash", { ...session, scopes: ["records:read"] }, "zyliad_confirm_command", {
        id,
        decision: "approve",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("returns a proposal the card can render alone: action, values and readable names", async () => {
    const objectId = "23c88c34-9bec-47d6-a803-b30f147e51a4";
    db.mcpDb.mockResolvedValueOnce({ id, status: "pending", expires_at: "2026-11-25T10:00:00Z" });
    db.mcpDb.mockResolvedValueOnce({
      objects: [{ id: objectId, name: "Entreprises", slug: "companies" }],
      attributes: [{ object_id: objectId, key: "secteur", name: "Secteur" }],
    });
    const values = { object_id: objectId, display_name: "Apple", attributes: { secteur: "Tech" } };
    const result = await executeTool(
      "hash",
      { ...session, scopes: ["crm:write", "configuration:read"] },
      "zyliad_create_record",
      { request_id: id, values },
    );
    expect(result).toMatchObject({
      id,
      status: "pending",
      action: "create_record",
      values,
      labels: { object_id: "Entreprises", "attributes.secteur": "Secteur" },
    });
    expect(db.mcpDb).toHaveBeenLastCalledWith("hash", "workspace");
    // Without configuration:read the proposal is unchanged and nothing else is read.
    db.mcpDb.mockClear();
    db.mcpDb.mockResolvedValueOnce({ id, status: "pending" });
    const plain = await executeTool(
      "hash",
      { ...session, scopes: ["crm:write"] },
      "zyliad_create_record",
      { request_id: id, values },
    );
    expect(plain).toMatchObject({ labels: {}, action: "create_record" });
    expect(plain).not.toHaveProperty("confirm_in_app");
    expect(db.mcpDb).toHaveBeenCalledTimes(1);
  });
  it("marks sensitive proposals as confirmed in Zyliad only, with their link", async () => {
    db.mcpDb.mockResolvedValueOnce({ id, status: "pending" });
    const result = await executeTool(
      "hash",
      { ...session, scopes: ["crm:write"] },
      "zyliad_remove_from_list",
      { request_id: id, values: { list_id: id, record_id: id } },
    );
    expect(result).toMatchObject({
      action: "remove_from_list",
      confirm_in_app: true,
      confirmation_url: `http://127.0.0.1:3000/app/settings?mcp_command=${id}#developpeurs`,
    });
  });
  it("keeps the sensitive action list identical to the database gate", async () => {
    const { readFile } = await import("node:fs/promises");
    const sql = await readFile(
      "supabase/migrations/20261124224517_mcp_app_confirmation.sql",
      "utf8",
    );
    const listed = /select action in \(([^)]*)\)/.exec(sql)![1].match(/'([a-z_]+)'/g)!;
    expect(listed.map((a) => a.slice(1, -1)).sort()).toEqual([...appConfirmedActions].sort());
    // Every sensitive action is a real proposal tool.
    const actions = Object.values(tools).flatMap((t) => ("action" in t ? [t.action] : []));
    for (const action of appConfirmedActions) expect(actions).toContain(action);
  });
  it("exposes all expected tools only under their grants", () => {
    expect(Object.keys(tools)).toHaveLength(42);
    expect(availableToolNames([])).toEqual(["zyliad_connection"]);
  });
});

describe("MCP 1.2", () => {
  const call = (name: string, args: unknown, scopes = session.scopes) => {
    db.mcpDb.mockImplementation(async (_token, operation) =>
      operation === "session"
        ? { ...session, scopes }
        : { data: [{ id, label: "Fixture contact" }], record: { id, display_name: "Fixture" } },
    );
    return handleMcp(
      new Request("http://127.0.0.1:3000/api/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer zmc_a_" + "a".repeat(43),
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2025-11-25",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      }),
    );
  };
  it("serves several requests in a row (prompt completion schemas are never mutated)", async () => {
    for (let i = 0; i < 3; i++) {
      const client = new Client({ name: "fixture-client", version: "1.0.0" });
      const transport = new StreamableHTTPClientTransport(
        new URL("http://127.0.0.1:3000/api/mcp"),
        {
          requestInit: { headers: { Authorization: "Bearer zmc_a_" + "a".repeat(43) } },
          fetch: async (url, init) => handleMcp(new Request(url, init)),
        },
      );
      try {
        await client.connect(transport);
        expect((await client.listPrompts()).prompts).toHaveLength(5);
        expect((await client.listResourceTemplates()).resourceTemplates[0].uriTemplate).toBe(
          "zyliad://record/{id}",
        );
      } finally {
        await client.close();
      }
    }
  }, 15000);
  it("answers a missing scope with HTTP 403 insufficient_scope and the full scope set", async () => {
    const response = await call("zyliad_create_task", { request_id: id, values: { title: "T" } });
    expect(response.status).toBe(403);
    const challenge = response.headers.get("www-authenticate") ?? "";
    expect(challenge).toContain("insufficient_scope");
    expect(challenge).toContain("crm:write");
    expect(challenge).toContain("records:read");
    expect(db.mcpDb).not.toHaveBeenCalledWith("hash", "prepare", expect.anything());
  });
  it("returns standard search results and fetches one with its own scope", async () => {
    db.mcpDb.mockResolvedValue({ data: [{ id, display_name: "Acme" }] });
    const found = await executeTool("hash", session, "search", { query: "Acme" });
    // Only the kinds this connection may read are searched (records and tasks here).
    expect((found as { results: { id: string }[] }).results.map((r) => r.id)).toEqual([
      `record:${id}`,
      `task:${id}`,
    ]);
    expect(JSON.stringify(found)).toContain("/app/search?q=Acme");
    await expect(executeTool("hash", session, "fetch", { id: `note:${id}` })).rejects.toMatchObject(
      { status: 403 },
    );
    db.mcpDb.mockResolvedValue({ record: { id, display_name: "Acme" } });
    const item = await executeTool("hash", session, "fetch", { id: `record:${id}` });
    expect(item).toMatchObject({ id: `record:${id}`, title: "Acme" });
  });
  it("allows CORS only for the canonical origin and MCP_ALLOWED_ORIGINS", async () => {
    vi.stubEnv("MCP_ALLOWED_ORIGINS", "http://localhost:6274");
    const { handleMcpPreflight } = await import("./server");
    const ok = handleMcpPreflight(
      new Request("http://127.0.0.1:3000/api/mcp", {
        method: "OPTIONS",
        headers: { origin: "http://localhost:6274" },
      }),
    );
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:6274");
    expect(ok.headers.get("access-control-expose-headers")).toContain("WWW-Authenticate");
    const denied = handleMcpPreflight(
      new Request("http://127.0.0.1:3000/api/mcp", {
        method: "OPTIONS",
        headers: { origin: "https://attacker.example" },
      }),
    );
    expect(denied.status).toBe(403);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("routes the new proposals and admin actions through prepare only", async () => {
    db.mcpDb.mockResolvedValue({ id, status: "pending" });
    const admin = { ...session, scopes: [...session.scopes, "crm:write", "crm:admin"] };
    await executeTool("hash", admin, "zyliad_add_to_list", {
      request_id: id,
      values: { list_id: id, record_id: id },
    });
    await executeTool("hash", admin, "zyliad_create_field", {
      request_id: id,
      values: { object_id: id, key: "score", name: "Score", type: "number" },
    });
    // Writes go through prepare only; the other calls are read-only workspace names.
    expect(db.mcpDb.mock.calls.filter((c) => c[1] !== "workspace").map((c) => c[1])).toEqual([
      "prepare",
      "prepare",
    ]);
    expect(db.mcpDb.mock.calls.filter((c) => c[1] === "prepare").map((c) => c[2]?.action)).toEqual([
      "add_to_list",
      "create_attribute",
    ]);
    await expect(
      executeTool(
        "hash",
        { ...session, scopes: [...session.scopes, "crm:write"] },
        "zyliad_merge_records",
        {
          request_id: id,
          values: {
            source_id: id,
            target_id: "a7d1e3b0-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
            source_version: 1,
            target_version: 1,
          },
        },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});

const invalidCredentialHeaders: Record<string, string>[] = [
  {},
  { cookie: "sb-auth-token=synthetic-session" },
  { authorization: "Bearer zmc_r_" + "q".repeat(43) },
  { authorization: "Bearer zmc_a_" + "q".repeat(42) },
  { authorization: "Basic synthetic-credentials" },
];
it.each(invalidCredentialHeaders)(
  "does not accept browser sessions, query tokens or wrong credential types: %j",
  async (headers) => {
    const token = "zmc_a_" + "q".repeat(43);
    const response = await handleMcp(
      new Request("http://127.0.0.1:3000/api/mcp?access_token=" + token, { headers }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain(token);
    expect(db.mcpDb).not.toHaveBeenCalled();
  },
);
it("does not expose CRM data for a revoked or unknown well-formed token", async () => {
  db.mcpDb.mockRejectedValue(new ApiError("Connexion révoquée.", 401, "unauthorized"));
  const response = await handleMcp(
    new Request("http://127.0.0.1:3000/api/mcp", {
      headers: { authorization: "Bearer zmc_a_" + "q".repeat(43) },
    }),
  );
  expect(response.status).toBe(401);
  expect(db.mcpDb).toHaveBeenCalledTimes(1);
  expect(db.mcpDb.mock.calls[0][1]).toBe("session");
  expect(await response.text()).not.toContain("Fixture contact");
});
