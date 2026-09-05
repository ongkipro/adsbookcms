import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  authFor,
  buildRouteMap,
  classify,
  methodsOf,
  toRoutePath,
  toXml,
} from "./route-map.ts";
import { CMS_VERSION } from "./version.ts";

test("a file path becomes the URL it actually serves", () => {
  assert.equal(toRoutePath("index.astro"), "/");
  assert.equal(toRoutePath("produk/index.astro"), "/produk");
  assert.equal(toRoutePath("produk/[slug].astro"), "/produk/[slug]");
  assert.equal(toRoutePath("assets/[...key].ts"), "/assets/[...key]");
  // Only the final extension is a file extension. `robots.txt.ts` serves
  // `/robots.txt`, and stripping both would have produced `/robots`.
  assert.equal(toRoutePath("robots.txt.ts"), "/robots.txt");
  assert.equal(toRoutePath("sitemap.xml.ts"), "/sitemap.xml");
  assert.equal(toRoutePath("feed/google-catalog.xml.ts"), "/feed/google-catalog.xml");
  assert.equal(toRoutePath("api/v1/openapi.json.ts"), "/api/v1/openapi.json");
});

test("the API families are told apart, longest prefix first", () => {
  // `/api/admin/...` and `/api/v1/...` both start with `/api/`, so an ordering
  // mistake here would file every admin endpoint as a public one.
  assert.equal(classify("/api/admin/orders/[id]"), "Admin API");
  assert.equal(classify("/api/v1/products/index"), "Headless API");
  assert.equal(classify("/api/webhooks/autolaris"), "Webhook");
  assert.equal(classify("/api/submit-order"), "Public API");
  assert.equal(classify("/admin/dashboard"), "Admin page");
  assert.equal(classify("/produk/[slug]"), "Storefront");
});

test("auth is reported from the family, and the wizard is not public", () => {
  assert.equal(authFor("/produk", "Storefront"), "public");
  assert.equal(authFor("/admin/orders", "Admin page"), "admin session");
  assert.equal(authFor("/api/v1/checkout", "Headless API"), "api key");
  // `/install` and `/api/install` are reachable without a session by design;
  // what stands in front of them is INSTALL_TOKEN, and the map must say so
  // rather than filing an unclaimed install as an open page.
  assert.equal(authFor("/install", "Install & auth"), "install token");
  assert.equal(authFor("/api/install", "Public API"), "install token");
});

test("an endpoint reports the verbs it exports, a page reports GET", () => {
  const source = "export const GET = 1; export const OPTIONS = 2; export const POST = 3;";
  assert.deepEqual(methodsOf(source, "api/thing.ts"), ["GET", "OPTIONS", "POST"]);
  assert.deepEqual(methodsOf("const GET = 1;", "produk/index.astro"), ["GET"]);
});

/**
 * The reason this file exists. `docs/route-map.xml` is committed, so it is only
 * worth reading if it cannot fall behind `src/pages/`. Add a page without
 * running `npm run route-map` and this fails, naming the route you added.
 */
test("the committed route map still matches the filesystem", () => {
  const generated = toXml(buildRouteMap(), CMS_VERSION.version);
  const committed = readFileSync(new URL("../../docs/route-map.xml", import.meta.url), "utf8");
  const paths = (xml: string) => [...xml.matchAll(/<route path="([^"]+)"/g)].map((m) => m[1]);
  const added = paths(generated).filter((route) => !paths(committed).includes(route));
  const removed = paths(committed).filter((route) => !paths(generated).includes(route));
  assert.deepEqual(
    { added, removed },
    { added: [], removed: [] },
    "run `npm run route-map` — src/pages and docs/route-map.xml disagree",
  );
  assert.equal(generated, committed, "run `npm run route-map` to regenerate the map");
});
