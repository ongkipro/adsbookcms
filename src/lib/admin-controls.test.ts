import assert from "node:assert/strict";
import { globSync, readdirSync, readFileSync, statSync } from "node:fs";
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
      // className="…" or the static text of className={`… ${x}`}.
      const classes = (/className="([^"]*)"/.exec(body)?.[1] ?? /className=\{`([^`]*)`\}/.exec(body)?.[1] ?? "").replace(/\$\{[^}]*\}/g, " ");
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

test("admin buttons take height, radius and type from the Button primitive", () => {
  // Buttons were sized per call (h-7 … h-11, rounded-xl, text-xs font-black),
  // so a toolbar or a header's actions never lined up. Size comes from the
  // `size` prop (default, sm, lg, icon, icon-sm, icon-lg); callers keep layout.
  const BUTTON_BANNED =
    /^(?:sm:|md:|lg:)?(?:h-\d+(?:\.\d+)?|min-h-\d+|rounded(?:-(?!l-none|r-none|full)\S+)?|text-(?:xs|sm|base|\[[^\]]+\])|font-(?:bold|extrabold|black|semibold)|shadow(?:-\S+)?)$/;
  const offenders = islands.flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return jsxTags(source, ["Button"]).flatMap(({ body, index }) => {
      const bad = (/className="([^"]*)"/.exec(body)?.[1] ?? "").split(/\s+/).filter((token) => BUTTON_BANNED.test(token));
      return bad.length ? [`${file}:${source.slice(0, index).split("\n").length} <Button> ${bad.join(" ")}`] : [];
    });
  });
  assert.deepEqual(offenders, []);
});

test("legacy .btn-* classes take their geometry from admin.css, not the call site", () => {
  // .btn-primary/.btn-blue/.btn-secondary are Button's static-page twin at h-10.
  // A call site that adds min-h-11, px-6 or text-xs puts a 44px button beside
  // a 40px one - the drift the Button guard above exists to stop.
  const banned = /^(?:sm:|md:)?(?:min-h-\S+|h-\d+\S*|px-\S+|text-(?:xs|sm|base|\[[^\]]+\])|rounded\S*|shadow\S*|font-\S+)$/;
  const files = [...globSync("src/pages/**/*.astro"), ...globSync("src/components/**/*.tsx")];
  const offenders = files.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/class(?:Name)?="([^"]*\bbtn-(?:primary|blue|secondary)\b[^"]*)"/g)]
      .flatMap((match) => match[1].split(/\s+/).filter((token) => banned.test(token)).map((token) => `${file} ${token}`)),
  );
  assert.deepEqual(offenders, []);
});

test("admin type stays on the scale: 12px floor, weights 400/500/600", () => {
  // Measured before this guard: twelve sizes from 9px to 30px and weights up
  // to 900 on one screen, ~250 labels at 10px on a phone. The scale is
  // text-xs 12 (caption) · text-sm 14 (body, UI) · text-base 16 (section
  // title, phone inputs) · text-xl/2xl 20/24 (page title, KPI) — DESIGN-SYSTEM §7.1.
  const banned = /(?<![\w-])(?:[a-z0-9]+:)*(?:text-\[(?:[0-9]|1[01])px\]|text-\[0\.[0-6]\d*rem\]|font-(?:bold|extrabold|black)|text-[3-9]xl)(?![\w-])/g;
  const files = [
    ...globSync("src/components/admin/*.{tsx,astro}"),
    ...globSync("src/pages/admin/**/*.astro"),
    "src/layouts/AdminLayout.astro",
  ];
  const offenders = files.flatMap((file) =>
    readFileSync(file, "utf8").split("\n").flatMap((line, index) =>
      [...line.matchAll(banned)].map((match) => `${file}:${index + 1} ${match[0]}`),
    ),
  );
  assert.deepEqual(offenders, []);
});

test("admin link buttons use buttonVariants or .btn-*, never a hand-built pill", () => {
  // A link styled by hand (min-h-11 rounded-xl text-xs) escaped both Button
  // guards and wrapped onto two lines at 768px on the dashboard header.
  const files = [...globSync("src/components/admin/*.tsx"), ...globSync("src/pages/admin/**/*.astro")];
  const handBuilt = /<a\b[^>]*class(?:Name)?="(?=[^"]*\b(?:min-h-1[01]|h-1[01])\b)(?=[^"]*\brounded-(?:lg|xl|md)\b)(?![^"]*\bbtn-)[^"]*"/g;
  const offenders = files.flatMap((file) =>
    readFileSync(file, "utf8").split("\n").flatMap((line, index) => (handBuilt.test(line) ? [`${file}:${index + 1}`] : [])),
  );
  assert.deepEqual(offenders, []);
});
