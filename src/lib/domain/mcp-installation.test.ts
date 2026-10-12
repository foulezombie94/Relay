import { it, expect } from "vitest";
import { mcpInstallationOrigin } from "./mcp-installation";
it("normalizes only a public canonical origin and never embeds secrets or shell syntax", () => {
  const withCredentials = new URL("https://example.test");
  withCredentials.username = "synthetic";
  withCredentials.password = "invalid-fixture";
  expect(mcpInstallationOrigin("https://ZYLIAD.example/")).toBe("https://zyliad.example");
  expect(mcpInstallationOrigin("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
  for (const value of [
    undefined,
    "http://external.example",
    withCredentials.href,
    "https://example.test/?token=secret",
    "https://example.test/path",
    "https://$(whoami).example",
    "https://example.test/#fragment",
  ])
    expect(mcpInstallationOrigin(value)).toBe("https://VOTRE-DOMAINE");
});
