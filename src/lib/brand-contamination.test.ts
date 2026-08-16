import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

/**
 * The reference store is demo data, and demo data belongs in the database where
 * a merchant can replace it. It does not belong in the product's own code,
 * assets or copy — anything there ships to every install and cannot be edited
 * out of a running store.
 *
 * This has now been found five times, on five surfaces that each looked like
 * the last one: the login-screen artwork (LOGIN-18), the login card's logo
 * (LOGIN-10), the storefront wordmark, the browser favicon used by every admin
 * page, and `robots.txt`, which handed every merchant's crawler someone else's
 * sitemap. Two of those were fixed while the document recording the fix was
 * being written, which is why this is a test and not a note.
 *
 * Tests are excluded: a fixture has to name *some* store, and naming the demo
 * one there is honest. Everything else must resolve identity at runtime.
 */

const ROOTS = ["src", "public"];
const SCANNED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".astro",
  ".js",
  ".css",
  ".svg",
  ".json",
  ".txt",
  ".xml",
  ".html",
]);

// The demo store's name in every spelling that has actually appeared: the bare
// domain, and the two words with or without a separator.
const CONTAMINATION = /permatamall|permata[\s_-]*mall/i;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (SCANNED_EXTENSIONS.has(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

test("product code carries no reference-store branding", () => {
  const offenders: string[] = [];

  for (const root of ROOTS) {
    for (const file of walk(root)) {
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;

      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (CONTAMINATION.test(line)) {
          offenders.push(`${file}:${index + 1} → ${line.trim().slice(0, 100)}`);
        }
      });
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "The demo store's brand belongs in the database, not in code that every " +
      "install ships. Resolve it from `Astro.locals.tenant` (server) or " +
      "`window.location.origin` (client island):\n  " + offenders.join("\n  "),
  );
});
