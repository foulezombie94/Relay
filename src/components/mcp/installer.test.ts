import { it, expect } from "vitest";
import { installationCommands } from "./installer";
it("provides real OAuth remote commands and our own hosted npm package", () => {
  expect(installationCommands("https://zyliad.example", "claude", "remote")).toBe(
    'claude mcp add --transport http zyliad "https://zyliad.example/api/mcp"',
  );
  expect(installationCommands("https://zyliad.example", "codex", "remote")).toContain(
    "codex mcp login zyliad",
  );
  expect(installationCommands("https://zyliad.example", "claude", "npx")).toContain(
    'npx --yes "https://zyliad.example/mcp/zyliad-mcp-1.0.0.tgz"',
  );
  expect(installationCommands("https://zyliad.example", "codex", "npm")).toContain(
    "npm install --global",
  );
});
