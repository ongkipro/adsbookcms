#!/usr/bin/env node
// Regenerate the pruned lucide set Icon.astro renders from.
//
// Icon.astro used to import @iconify-json/lucide/icons.json whole: a 620KB
// chunk — the single largest in the worker — JSON.parsed on every isolate
// cold start, to serve the handful of icons the templates actually name.
// This script extracts just those icons (aliases resolved by getIcons) into
// a checked-in subset. src/lib/lucide-subset.test.ts fails the build when a
// template names an icon the subset lacks; rerun this script to fix it:
//
//   node scripts/generate-lucide-subset.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getIcons } from '@iconify/utils';

// Every statically written `lucide:<name>` in the source tree, collected by
// walking the files in-process — a shelled-out grep whose binary is missing
// returns nothing and silently produces an empty subset. Icon.astro only
// ever receives literal names; the subset test re-asserts that stays true.
export function collectLucideNames(rootDir) {
  const names = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(astro|ts|tsx|mjs|js)$/.test(entry.name)) {
        for (const m of readFileSync(p, 'utf8').matchAll(/lucide:([a-z0-9-]+)/g)) {
          names.add(m[1]);
        }
      }
    }
  };
  walk(rootDir);
  return [...names].sort();
}

// Targets of Icon.astro's ICON_MAP aliases, read from the component itself so
// the two cannot drift apart silently. 'package' is the hard fallback.
export function collectMappedNames(iconAstroSource) {
  const mapBlock = iconAstroSource.match(/ICON_MAP[^{]*\{([\s\S]*?)\}/)?.[1] ?? '';
  return [...mapBlock.matchAll(/:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);
}

function main() {
  const lucide = JSON.parse(
    readFileSync(new URL('../node_modules/@iconify-json/lucide/icons.json', import.meta.url), 'utf8'),
  );
  const written = collectLucideNames(fileURLToPath(new URL('../src', import.meta.url)));
  if (!written.length) throw new Error('No lucide: names found under src — the scan is broken.');
  const iconAstro = readFileSync(
    new URL('../src/components/storefront/shared/Icon.astro', import.meta.url),
    'utf8',
  );
  const names = [...new Set([...written, ...collectMappedNames(iconAstro), 'package'])].sort();

  const subset = getIcons(lucide, names);
  if (!subset) throw new Error('getIcons returned null');
  const missing = names.filter((n) => !(n in subset.icons) && !(n in (subset.aliases ?? {})));
  if (missing.length) throw new Error(`Unknown lucide icons: ${missing.join(', ')}`);

  const out = new URL('../src/components/storefront/shared/lucide-subset.json', import.meta.url);
  writeFileSync(out, JSON.stringify(subset));
  console.log(
    `${names.length} icons -> lucide-subset.json (${(JSON.stringify(subset).length / 1024).toFixed(1)}KB)`,
  );
}

// Run only when invoked directly; the subset test imports the collectors from
// this file and must not trigger a regeneration.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
