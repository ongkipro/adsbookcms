import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * One guard for one defect, and it is the worst this repository has had.
 *
 * `src/middleware.ts` classified every request — private or public, admin or
 * storefront, installer or not — from `new URL(context.request.url)`. Astro
 * routes on a *normalized* pathname instead: it percent-decodes in a loop and
 * collapses duplicate slashes, exposing the result as `context.url` while
 * leaving `context.request` at the raw bytes the client sent.
 *
 * So the middleware read one path and Astro served another. `isAdminApi` was
 * false for `//api/admin/settings`, the whole `if (isPrivate)` block was
 * skipped — session check, role check, CSRF origin check, rotation gate — and
 * the handler ran anyway. Measured on the built Worker under `wrangler dev`,
 * with no cookie:
 *
 *     GET  /api/admin/settings   -> 401
 *     GET  //api/admin/settings  -> 200, full provider settings
 *     GET  //admin/dashboard     -> 200
 *     GET  /%61dmin/orders       -> 200
 *     PUT  //api/admin/settings  -> 200 from a cross-site origin
 *
 * That last one rewrote the courier provider's API key and base URL. Every
 * admin surface was readable, and most were writable, from a drive-by page.
 *
 * The rule this pins: path decisions come from the value Astro itself routed
 * on. Anything derived from `context.request.url` is, by construction, a
 * different string.
 */

const SOURCE = readFileSync(
  new URL("../middleware.ts", import.meta.url),
  "utf8",
);

test("middleware decides paths from Astro's normalized URL", () => {
  assert.match(
    SOURCE,
    /const url = context\.url;/,
    "middleware must bind `url` to context.url",
  );

  const rawReads = SOURCE.match(/new URL\(\s*context\.request\.url/g) ?? [];
  assert.deepEqual(
    rawReads,
    [],
    "`new URL(context.request.url)` reintroduces the admin-gate bypass: the " +
      "raw path is not the path Astro routes on. Use `context.url`.",
  );
});

test("an admin prefix match cannot swallow a storefront slug", () => {
  // `'/admin-sale'.startsWith('/admin')` is true, so a landing page whose slug
  // merely begins with those letters would redirect every customer to /hello.
  assert.doesNotMatch(
    SOURCE,
    /isAdminPage\s*=\s*url\.pathname\.startsWith\('\/admin'\)/,
    "match '/admin' exactly or '/admin/' as a prefix, never '/admin'",
  );
  assert.match(SOURCE, /url\.pathname\.startsWith\('\/admin\/'\)/);
});

test("an installed store does not redirect asset paths to the login screen", () => {
  // `isInstallerPath` covers `/images/`, `/_astro/` and the favicons so the
  // wizard can render before a store exists. Reusing it for the *installed*
  // case meant a missing image answered 302 to /hello instead of 404 — an
  // <img> receiving an HTML login page. The installed branch matches only the
  // installer's own routes.
  assert.match(
    SOURCE,
    /identity\.state === 'installed' && isInstallerRoute\(url\.pathname\)/,
    "the installed-state redirect must use isInstallerRoute, not isInstallerPath",
  );
  assert.doesNotMatch(SOURCE, /identity\.state === 'installed' && isInstallerPath\(/);
  // The uninstalled branch still needs the wider set, or the wizard renders
  // without its own stylesheet.
  assert.match(SOURCE, /!isInstallerPath\(url\.pathname\)/);
});
