import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A guard for one specific defect, which has shipped three times in this
 * repository and is invisible to tsc, astro check and every unit test.
 *
 * A `display: grid` container with no explicit column sizes its implicit track
 * `auto`, and a grid item's automatic minimum size is its **min-content** — not
 * zero. `truncate` implies `white-space: nowrap`, so a card containing a
 * truncated title has a min-content as wide as that title unwrapped. The track
 * therefore grows past the viewport, and because these lists sit inside
 * `overflow-hidden` wrappers the excess is clipped rather than scrollable,
 * putting the row's controls physically off-screen with no way to reach them.
 *
 * It has cost real functionality each time: the product, order and shipping
 * mobile lists, then the CRM action group with `grid-cols-5` on a phone, then
 * the permission matrix losing its right-hand role column.
 *
 * Tailwind's `grid-cols-*` expands to `repeat(n, minmax(0, 1fr))`, and the
 * `minmax(0, …)` is precisely what stops min-content from widening the track.
 * So: a grid that is mobile-visible must say how many columns it has.
 */

const ADMIN_DIRS = [
  "src/components/admin",
  "src/pages/admin",
  // Rendered inside the admin shell, so subject to the same phone. Previously
  // out of scope, which is how `chart.tsx`'s bare `grid gap-1.5` sat on the
  // dashboard unexamined.
  "src/components/ui",
  "src/layouts",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|astro)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Extracts every class list, in each spelling this codebase actually uses.
 *
 * The first version of this matched double-quoted attributes only, so it saw
 * one of the seven ways a class list is written here and missed `cn(...)`,
 * template literals, single-quoted Astro attributes and `class:list`. Any
 * quoted run of class-like tokens counts, wherever it appears.
 */
function classLists(source: string): { value: string; line: number }[] {
  const found: { value: string; line: number }[] = [];
  const lines = source.split("\n");

  lines.forEach((line, index) => {
    // Every single- or double-quoted, or backticked, string on the line. Class
    // lists inside cn() and template literals are just strings in an argument
    // list, so scanning strings rather than attributes catches all of them.
    const strings = line.match(/"[^"]*"|'[^']*'|`[^`]*`/g) ?? [];
    for (const raw of strings) {
      const value = raw.slice(1, -1);
      // A template literal's `${…}` holes are unknowable; strip them and judge
      // the literal part, which is where a bare `grid` is always written.
      const literal = value.replace(/\$\{[^}]*\}/g, " ");
      if (!/\bgrid\b/.test(literal)) continue;
      found.push({ value: literal, line: index + 1 });
    }
  });

  return found;
}

function lineText(source: string, line: number): string {
  return source.split("\n")[line - 1] ?? "";
}

test("a mobile-visible grid always declares its columns", () => {
  const offenders: string[] = [];

  for (const dir of ADMIN_DIRS) {
    for (const file of walk(dir)) {
      const source = readFileSync(file, "utf8");
      for (const { value, line } of classLists(source)) {
        const tokens = value.split(/\s+/).filter(Boolean);
        if (!tokens.includes("grid")) continue;

        // The declaration must be UNPREFIXED. This is the whole point and the
        // first version had it backwards: it accepted `grid-cols-*` "at any
        // breakpoint prefix", so `grid gap-3 sm:grid-cols-2` passed — and below
        // `sm` that class list has no grid-template-columns at all, which is
        // precisely the single implicit auto track this file exists to stop.
        // 48 live admin grids matched that shape while the suite was green.
        if (tokens.some((t) => /^grid-cols-/.test(t))) continue;

        // `grid` used purely to centre a single child is not a track problem.
        if (tokens.some((t) => /(^|:)place-(items|content)-/.test(t))) continue;
        // Columns declared through an inline style are just as explicit. Judged
        // on the same line: the old version searched around `indexOf(value)`,
        // the FIRST occurrence of that class string in the file, so a repeated
        // class list had it inspecting an unrelated node.
        if (/gridTemplateColumns|grid-template-columns/.test(lineText(source, line))) continue;
        // A container that is not `grid` until a breakpoint cannot overflow a
        // phone — but only if `grid` itself is prefixed. `grid sm:flex` is a
        // grid *on* mobile and was being skipped as though it were hidden.
        if (!tokens.includes("grid")) continue;
        if (tokens.includes("hidden") && tokens.some((t) => /^(sm|md|lg|xl):/.test(t))) continue;

        offenders.push(`${file}:${line} → class="${value.slice(0, 90)}"`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "These grids size their implicit track to min-content, which is how admin " +
      "controls have three times ended up clipped off-screen on a phone. Add " +
      "an explicit grid-cols-* (Tailwind expands it to minmax(0, 1fr)):\n  " +
      offenders.join("\n  "),
  );
});
