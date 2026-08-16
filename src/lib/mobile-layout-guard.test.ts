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

const ADMIN_DIRS = ["src/components/admin", "src/pages/admin"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|astro)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Extracts every class attribute value, whichever spelling the file uses. */
function classLists(source: string): { value: string; line: number }[] {
  const found: { value: string; line: number }[] = [];
  const pattern = /(?:className|class)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    found.push({
      value: match[1],
      line: source.slice(0, match.index).split("\n").length,
    });
  }
  return found;
}

test("a mobile-visible grid always declares its columns", () => {
  const offenders: string[] = [];

  for (const dir of ADMIN_DIRS) {
    for (const file of walk(dir)) {
      const source = readFileSync(file, "utf8");
      for (const { value, line } of classLists(source)) {
        const tokens = value.split(/\s+/).filter(Boolean);
        if (!tokens.includes("grid")) continue;

        // Any explicit column declaration is enough, at any breakpoint prefix.
        const declares = tokens.some((t) => /(^|:)grid-cols-/.test(t));
        if (declares) continue;

        // `grid` used purely to centre a single child is not a track problem.
        if (tokens.some((t) => /(^|:)place-items-/.test(t))) continue;
        // Columns declared through an inline style are just as explicit.
        if (/gridTemplateColumns/.test(source.slice(Math.max(0, source.indexOf(value) - 400), source.indexOf(value) + 400))) continue;
        // A container hidden below the breakpoint cannot overflow a phone.
        if (tokens.some((t) => /^(sm|md|lg|xl):(grid|flex|block)$/.test(t))) continue;
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
