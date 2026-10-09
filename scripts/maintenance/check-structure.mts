import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" },
).split("\0").filter((file) => file && existsSync(path.join(root, file)));
const failures: string[] = [];
let imports = 0;
let links = 0;

function isFile(file: string) {
  return existsSync(file) && statSync(file).isFile();
}

function resolves(base: string) {
  return [base, ...[".ts", ".tsx", ".mts", ".js", ".mjs"].map((ext) => base + ext),
    ...["index.ts", "index.tsx", "index.mts", "index.js"].map((name) => path.join(base, name)),
  ].some(isFile);
}

for (const file of new Set(files)) {
  // Next.js owns this declaration file and creates its .next imports during
  // dev/build. A fresh checkout cannot resolve them before those steps run.
  if (file === "next-env.d.ts") continue;
  if (!/\.(?:ts|tsx|mts|mjs|md)$/.test(file)) continue;
  const absolute = path.join(root, file);
  const content = readFileSync(absolute, "utf8");
  if (file.endsWith(".md")) {
    for (const match of content.matchAll(/\]\(([^)\n]+)\)/g)) {
      const target = match[1].replace(/^<|>$/g, "");
      if (/^(?:[a-z][\w+.-]*:|#|\/)/i.test(target)) continue;
      const relative = target.split(/[?#]/)[0];
      if (!relative) continue;
      links++;
      if (!existsSync(path.resolve(path.dirname(absolute), relative)))
        failures.push(`${file}: lien local manquant ${target}`);
    }
    continue;
  }
  for (const reference of ts.preProcessFile(content, true, true).importedFiles) {
    const specifier = reference.fileName;
    if (!specifier.startsWith(".") && !specifier.startsWith("@/")) continue;
    imports++;
    const base = specifier.startsWith("@/")
      ? path.join(root, "src", specifier.slice(2))
      : path.resolve(path.dirname(absolute), specifier);
    if (!resolves(base)) failures.push(`${file}: import local manquant ${specifier}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Structure OK : ${imports} imports et ${links} liens locaux vérifiés.`);
}
