import { describe, it, expect, vi } from "vitest";
import { installNative } from "../../../packages/zyliad-mcp/src/install.mjs";
const endpoint = "https://zyliad.example/api/mcp";
describe("native MCP installation persistence", () => {
  it.each(["claude", "codex"])(
    "reuses %s native configuration across starts without a new login",
    async (client) => {
      const entry =
        client === "claude"
          ? `zyliad:\n  Type: http\n  URL: ${endpoint}\n`
          : JSON.stringify({ transport: { type: "streamable_http", url: endpoint } });
      const run = vi.fn().mockResolvedValue({ code: 0, output: entry });
      expect(await installNative(endpoint, client, run)).toEqual({ reused: true });
      expect(await installNative(endpoint, client, run)).toEqual({ reused: true });
      expect(run.mock.calls.every((x) => x[1][1] === "get")).toBe(true);
    },
  );
  it("installs Claude for the user, not the current project", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ code: 1, output: "" })
      .mockResolvedValueOnce({ code: 0, output: "" });
    expect(await installNative(endpoint, "claude", run)).toEqual({ reused: false });
    expect(run).toHaveBeenLastCalledWith("claude", [
      "mcp",
      "add",
      "--scope",
      "user",
      "--transport",
      "http",
      "zyliad",
      endpoint,
    ]);
  });
  it("migrates the old Claude bridge but never stores OAuth credentials itself", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        output: `zyliad:\n Type: stdio\n Command: npx\n Args: https://zyliad.example/mcp/zyliad-mcp-1.0.0.tgz ${endpoint}`,
      })
      .mockResolvedValue({ code: 0, output: "" });
    await installNative(endpoint, "claude", run);
    expect(run.mock.calls.map((x) => x[1][1])).toEqual(["get", "remove", "add"]);
    expect(JSON.stringify(run.mock.calls)).not.toMatch(/token|secret|Authorization/);
  });
  it("migrates Codex to HTTP once, leaving the CLI to perform its own OAuth flow", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        output: JSON.stringify({
          transport: {
            type: "stdio",
            command: "npx",
            args: ["https://zyliad.example/mcp/zyliad-mcp-1.0.0.tgz", endpoint],
          },
        }),
      })
      .mockResolvedValue({ code: 0, output: "" });
    await installNative(endpoint, "codex", run);
    expect(run.mock.calls.map((x) => x[1][1])).toEqual(["get", "add"]);
    expect(run).toHaveBeenLastCalledWith("codex", ["mcp", "add", "zyliad", "--url", endpoint]);
  });
  it("refuses another issuer or arbitrary stdio server without erasing its configuration", async () => {
    const run = vi.fn().mockResolvedValue({
      code: 0,
      output: JSON.stringify({
        transport: { type: "streamable_http", url: "https://other.example/api/mcp" },
      }),
    });
    await expect(installNative(endpoint, "codex", run)).rejects.toThrow("configuré autrement");
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("does not start a client for an invalid endpoint or unsupported client", async () => {
    const run = vi.fn();
    await expect(installNative("http://evil.example/api/mcp", "claude", run)).rejects.toThrow();
    await expect(installNative(endpoint, "shell", run)).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });
});
