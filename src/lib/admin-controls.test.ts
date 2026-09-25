import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * The admin control contract (DESIGN-SYSTEM.md §7.1): the shadcn primitives
 * own a form control's height, radius, background, border colour and type
 * size, and filter rows are built from `components/admin/filter-bar.tsx`.
 * Controls used to be sized per call (h-7 … h-11, rounded-xl, bg-slate-50),
 * so neighbours never lined up and rows overlapped. Layout classes — width,
 * flex, font-mono, a textarea's min-height — stay the caller's business.
 */
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const BANNED =
  /^(?:sm:|md:|lg:|focus:|hover:)?(?:h-\d+(?:\.\d+)?|min-h-\d+|rounded(?:-(?!l-none|r-none)\S+)?|text-(?:xs|sm|base|\[[^\]]+\])|bg-(?:white|slate-\d+(?:\/\d+)?|amber-\d+(?:\/\d+)?|transparent)|shadow(?:-\S+)?|border-slate-\d+)$/;

const islands = walk("src/components/admin").filter((file) => file.endsWith(".tsx"));

/** Opening JSX tags of `names`, read to their real end: a `>` inside `{…}`
 *  (an arrow function in `onChange`) does not close the tag. */
function jsxTags(source: string, names: string[]) {
  const tags: { tag: string; body: string; index: number }[] = [];
  const opener = new RegExp(`<(${names.join("|")})\\b`, "g");
  for (const match of source.matchAll(opener)) {
    let depth = 0;
    let quote = "";
    let end = match.index + match[0].length;
    for (; end < source.length; end += 1) {
      const char = source[end];
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'" || char === "`") quote = char;
      else if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      else if (char === ">" && depth === 0) break;
    }
    tags.push({ tag: match[1], body: source.slice(match.index + match[0].length, end), index: match.index });
  }
  return tags;
}

test("admin form controls take their size and shape from the shadcn primitive", () => {
  const offenders: string[] = [];
  for (const file of islands) {
    const source = readFileSync(file, "utf8");
    for (const { tag, body, index } of jsxTags(source, ["Input", "SelectTrigger", "Textarea", "InputGroup"])) {
      // A dark code editor is a deliberate, declared exception.
      if (/\bdata-code-editor\b/.test(body)) continue;
      const classes = /className="([^"]*)"/.exec(body)?.[1] ?? "";
      const bad = classes
        .split(/\s+/)
        .filter(Boolean)
        .filter((token) => BANNED.test(token) && !(tag === "Textarea" && token.startsWith("min-h-")));
      if (tag === "SelectTrigger" && /\ssize="sm"/.test(body)) bad.push('size="sm"');
      if (bad.length) {
        const line = source.slice(0, index).split("\n").length;
        offenders.push(`${file}:${line} <${tag}> ${bad.join(" ")}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("search fields are SearchInput, not an icon positioned over an input", () => {
  const offenders = islands
    .filter((file) => !file.endsWith("filter-bar.tsx"))
    .filter((file) => /<(Search|SearchIcon)\b[^>]*className="[^"]*\babsolute\b/.test(readFileSync(file, "utf8")));
  assert.deepEqual(offenders, []);
});

test("a static admin page sizes inputs through admin-input-flat alone", () => {
  const offenders = walk("src/pages/admin")
    .filter((file) => file.endsWith(".astro"))
    .flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/class="(admin-input-flat[^"]*)"/g)]
        .filter(([, classes]) => /(?<![\w-])(h-\d+|min-h-11)(?![\w-])/.test(classes))
        .map(([, classes]) => `${file}: ${classes}`),
    );
  assert.deepEqual(offenders, []);
});

test("admin buttons use the control height, not the 44px marketing size", () => {
  // Buttons sit in the same rows as inputs and selects; `xl` made every
  // toolbar and form footer 4px taller than the fields beside it.
  const offenders = islands.flatMap((file) =>
    jsxTags(readFileSync(file, "utf8"), ["Button"])
      .filter(({ body }) => /\ssize="xl"/.test(body))
      .map(({ index }) => `${file}@${index}`),
  );
  assert.deepEqual(offenders, []);
});
