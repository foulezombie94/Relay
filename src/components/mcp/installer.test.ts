import { it, expect } from "vitest";
import { installationCommands } from "./installer";
it("installs native HTTP persistently in both clients without a duplicate Codex login", () => {
  expect(installationCommands("https://zyliad.example", "claude", "remote")).toBe(
    'claude mcp add --scope user --transport http zyliad "https://zyliad.example/api/mcp"',
  );
  const codex = installationCommands("https://zyliad.example", "codex", "remote");
  expect(codex).toBe('codex mcp add zyliad --url "https://zyliad.example/api/mcp"');
  expect(codex).not.toContain("mcp login");
  for (const client of ["claude", "codex"] as const) {
    const npx = installationCommands("https://zyliad.example", client, "npx");
    expect(npx).toBe(
      `npx --yes "https://zyliad.example/mcp/zyliad-mcp-1.1.0.tgz" install --client ${client} "https://zyliad.example/api/mcp"`,
    );
    expect(npx).not.toContain("--transport stdio");
    const npm = installationCommands("https://zyliad.example", client, "npm");
    expect(npm).toContain(`zyliad-mcp install --client ${client}`);
  }
});
