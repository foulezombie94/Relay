import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});
it("CI artifact scan fails on leaked tokens without printing the matched value", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "zyliad-secret-scan-"));
  directories.push(directory);
  const file = path.join(directory, "client.js"),
    token = "ya29." + "test-only-".repeat(10);
  writeFileSync(file, JSON.stringify({ value: token }));
  let failure: { status?: number; stderr?: Buffer } | undefined;
  try {
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/tests/secret-boundaries.mts", file],
      { stdio: "pipe" },
    );
  } catch (error) {
    failure = error as typeof failure;
  }
  expect(failure?.status).toBe(1);
  expect(failure?.stderr?.toString()).toContain("google-access-token");
  expect(failure?.stderr?.toString()).not.toContain(token);
  writeFileSync(file, "export const title = 'Zyliad';");
  expect(
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/tests/secret-boundaries.mts", file],
      { encoding: "utf8" },
    ),
  ).toContain("Secret boundaries OK");
});
