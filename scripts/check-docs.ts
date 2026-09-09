import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const files = execFileSync("git", ["ls-files", "*.md"], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);
const failures: string[] = [];
const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  if (!source.startsWith("# ") && !source.startsWith("---\n")) {
    failures.push(`${file}: must start with one H1 or YAML frontmatter`);
  }
  for (const match of source.matchAll(linkPattern)) {
    const target = match[1].trim().replace(/^<|>$/g, "");
    if (!target || /^(?:https?:|mailto:|#)/.test(target)) continue;
    const path = decodeURIComponent(target.split("#", 1)[0]);
    if (path && !existsSync(resolve(dirname(file), path))) {
      failures.push(`${file}: missing local link ${target}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Documentation check passed: ${files.length} Markdown files, local links resolved.`);
}
