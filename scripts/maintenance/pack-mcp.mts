import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
const pkg = JSON.parse(readFileSync("packages/zyliad-mcp/package.json", "utf8"));
if (pkg.name !== "zyliad-mcp" || !/^\d+\.\d+\.\d+$/.test(pkg.version))
  throw new Error("Invalid MCP package version");
mkdirSync("public/mcp", { recursive: true });
execFileSync(
  "npm",
  ["pack", "./packages/zyliad-mcp", "--pack-destination", "public/mcp", "--ignore-scripts"],
  { stdio: "inherit" },
);
