import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * AdminShell owns the page width (`max-w-[1560px]`). Pages that set their own
 * centred max-width gave five different content edges at 1920px — the header
 * and cards jumped left and right between menus. Inner blocks may still limit
 * a paragraph or a preview; a centred page-level container may not come back.
 */
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

test("no admin page or island sets its own centred page width", () => {
  const offenders = [...walk("src/pages/admin"), ...walk("src/components/admin")]
    .filter((file) => /\.(astro|tsx)$/.test(file))
    .flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => /class(Name)?="[^"]*\bmx-auto\b[^"]*\bmax-w-(5xl|6xl|7xl)\b|class(Name)?="[^"]*\bmax-w-(5xl|6xl|7xl)\b[^"]*\bmx-auto\b/.test(line))
        .map(({ index }) => `${file}:${index + 1}`),
    );
  assert.deepEqual(offenders, []);
});
