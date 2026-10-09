import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// Follow every local runtime dependency, including re-exports. Type-only imports cannot execute.
function publicModules(entry: string, seen = new Set<string>()) {
  const file = path.resolve(entry);
  if (seen.has(file)) return seen;
  seen.add(file);
  const source = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  for (const node of ast.statements) {
    if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node))
      continue;
    if (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) continue;
    if (ts.isExportDeclaration(node) && node.isTypeOnly) continue;
    const spec = node.moduleSpecifier;
    if (!spec || !ts.isStringLiteral(spec)) continue;
    const name = spec.text;
    expect(name, file).not.toMatch(
      /supabase|react-query|data-provider|sentry|recharts|exceljs|date-picker/,
    );
    if (!name.startsWith(".") && !name.startsWith("@/")) continue;
    const base = name.startsWith("@/")
      ? path.resolve("src", name.slice(2))
      : path.resolve(path.dirname(file), name);
    if (/\.(css|ttf)$/.test(base)) continue;
    const resolved = [
      base + ".tsx",
      base + ".ts",
      path.join(base, "index.tsx"),
      path.join(base, "index.ts"),
    ].find((f) => fs.existsSync(f));
    if (!resolved) throw new Error("Unresolved public dependency: " + name);
    publicModules(resolved, seen);
  }
  return seen;
}
describe("public landing preview isolation", () => {
  it("disables automatic private route prefetch in previews", () => {
    const source = fs.readFileSync(
      "src/components/app-sidebar-view.tsx",
      "utf8",
    );
    const count = (source.match(/<Link\b/g) ?? []).length;
    expect(
      (
        source.match(/prefetch=\{\s*persistPreferences\s*\?\s*undefined\s*:\s*false\s*\}/g) ??
        []
      ).length,
    ).toBe(count);
  });
  it("loads presentation components without database, auth, queries or CRM pages", () => {
    const files = publicModules("src/app/page.tsx");
    publicModules("src/app/layout.tsx", files);
    for (const file of files) {
      expect(file).not.toMatch(/[\\/]pages[\\/].*\.tsx$/);
      expect(fs.readFileSync(file, "utf8"), file).not.toMatch(
        /\b(fetch|XMLHttpRequest|browserDb|useWorkspace|useRows)\s*\(/,
      );
    }
    expect(files.size).toBeGreaterThan(1);
  });
});
