import { describe, it, expect } from "vitest";
import {
  validEndpoint,
  validCallback,
  createOAuthProvider,
} from "../../../packages/zyliad-mcp/src/oauth-provider.mjs";
describe("MCP npm bridge security", () => {
  it("does not send OAuth credentials to insecure or parameterized endpoints", () => {
    expect(validEndpoint("https://zyliad.example/api/mcp").origin).toBe("https://zyliad.example");
    for (const endpoint of [
      "http://attacker.example/api/mcp",
      "https://zyliad.example/api/mcp?token=leak",
      "https://user:secret@zyliad.example/api/mcp",
      "https://zyliad.example/any-api",
    ])
      expect(() => validEndpoint(endpoint)).toThrow();
  });
  it("rejects wrong state, wrong issuer, duplicate callbacks and missing codes", () => {
    const state = "synthetic-state",
      issuer = "https://zyliad.example",
      base = new URLSearchParams({ state, iss: issuer, code: "a".repeat(43) });
    expect(validCallback(base, state, issuer)).toBe(true);
    expect(validCallback(base, "wrong", issuer)).toBe(false);
    expect(validCallback(base, state, "https://attacker.example")).toBe(false);
    base.append("state", state);
    expect(validCallback(base, state, issuer)).toBe(false);
  });
  it("binds issuer and audience and keeps tokens off the filesystem", async () => {
    const p = await createOAuthProvider(new URL("https://zyliad.example/api/mcp"), false);
    try {
      expect(p.provider.redirectUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback$/);
      await expect(
        p.provider.validateResourceURL(
          "https://zyliad.example/api/mcp",
          "https://attacker.example/api/mcp",
        ),
      ).rejects.toThrow();
      expect(() =>
        p.provider.saveDiscoveryState({ authorizationServerUrl: "https://attacker.example" }),
      ).toThrow();
      const response = await fetch(
        p.provider.redirectUrl +
          "?" +
          new URLSearchParams({
            state: p.provider.state(),
            iss: "https://zyliad.example",
            code: "a".repeat(43),
          }),
      );
      expect(response.status).toBe(200);
      await expect(p.callback).resolves.toBeInstanceOf(URLSearchParams);
      const duplicate = await fetch(
        p.provider.redirectUrl +
          "?" +
          new URLSearchParams({
            state: p.provider.state(),
            iss: "https://zyliad.example",
            code: "a".repeat(43),
          }),
      );
      expect(duplicate.status).toBe(400);
    } finally {
      p.close();
    }
  });
});

// The exact archive served by the landing must contain the reviewed sources.
it("ships the reviewed bridge sources in the public npm archive", async () => {
  const { execFileSync } = await import("node:child_process");
  const { readFileSync } = await import("node:fs");
  for (const file of ["package.json", "README.md", "src/cli.mjs", "src/oauth-provider.mjs"]) {
    const packed = execFileSync(
      "tar",
      ["-xOzf", "public/mcp/zyliad-mcp-1.0.0.tgz", "package/" + file],
      { encoding: "utf8" },
    );
    expect(packed).toBe(readFileSync("packages/zyliad-mcp/" + file, "utf8"));
  }
  const pkg = JSON.parse(readFileSync("packages/zyliad-mcp/package.json", "utf8"));
  expect(pkg.dependencies["@modelcontextprotocol/client"]).toBe("2.3.1");
  expect(pkg.dependencies).not.toHaveProperty("@modelcontextprotocol/sdk");
});
