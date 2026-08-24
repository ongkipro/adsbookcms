import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// The collectors live in the generator so the test and the generated file can
// never disagree about what counts as a used icon.
import { collectLucideNames, collectMappedNames } from "../../scripts/generate-lucide-subset.mjs";

const srcDir = fileURLToPath(new URL("..", import.meta.url));
const subset = JSON.parse(
  readFileSync(
    new URL("../components/storefront/shared/lucide-subset.json", import.meta.url),
    "utf8",
  ),
) as { icons: Record<string, unknown>; aliases?: Record<string, unknown> };

const available = (name: string) =>
  name in subset.icons || name in (subset.aliases ?? {});

test("every lucide icon named in src exists in the pruned subset", () => {
  const written = collectLucideNames(srcDir) as string[];
  // An empty scan means the collector broke, not that no icons are used —
  // exactly the failure that once let a missing grep binary produce a subset
  // holding only the alias-map icons.
  assert.ok(written.length >= 10, `scan found only ${written.length} names`);
  const missing = written.filter((name) => !available(name));
  assert.deepEqual(
    missing,
    [],
    `Missing from lucide-subset.json: ${missing.join(", ")} — run: node scripts/generate-lucide-subset.mjs`,
  );
});

test("every ICON_MAP alias target and the fallback exist in the subset", () => {
  const iconAstro = readFileSync(
    new URL("../components/storefront/shared/Icon.astro", import.meta.url),
    "utf8",
  );
  const mapped = collectMappedNames(iconAstro) as string[];
  assert.ok(mapped.length >= 5, `alias map parse found only ${mapped.length} targets`);
  const missing = [...mapped, "package"].filter((name) => !available(name));
  assert.deepEqual(
    missing,
    [],
    `Missing from lucide-subset.json: ${missing.join(", ")} — run: node scripts/generate-lucide-subset.mjs`,
  );
});

test("Icon.astro imports the subset, not the full lucide set", () => {
  const iconAstro = readFileSync(
    new URL("../components/storefront/shared/Icon.astro", import.meta.url),
    "utf8",
  );
  assert.match(iconAstro, /from '\.\/lucide-subset\.json'/);
  // The comment naming the old import is fine; the import itself is not.
  assert.doesNotMatch(iconAstro, /from '@iconify-json\/lucide\/icons\.json'/);
});
