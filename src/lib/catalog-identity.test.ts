import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { mergeStorefrontCatalog } from "./catalog-data.ts";
import {
  catalogProductId,
  defaultCatalogContentId,
  generateGoogleCatalogXml,
  generateMetaCatalogXml,
  catalogProductIdOrNull,
} from "./catalog-feed.ts";

/**
 * One invariant, and it is the only thing that makes catalog advertising work:
 *
 *   the `id` a feed publishes  ===  the string the Pixel sends as content_ids
 *
 * Meta states it plainly — "for dynamic ads, this ID must exactly match the
 * content ID for the same item in your Meta Pixel". When it does not match,
 * nothing errors. Advantage+ and Dynamic Product Ads simply retarget nobody,
 * the merchant sees spend with no catalog attribution, and there is no signal
 * anywhere that says why.
 *
 * It did not match. The feed published `10001` (row id + 10000), the admin
 * screen showed the operator that same `10001`, and the Pixel sent `1`. Three
 * values for one product, and every test was green.
 *
 * So this file checks the two halves against each other rather than each
 * against a fixture, because a fixture is exactly how three values passed CI.
 */

const productRows = [
  {
    id: 10001,
    title: "Serum Wajah",
    slug: "serum-wajah",
    category: "Skincare",
    is_active: 1,
    image_url: "/images/serum/1.webp",
  },
] as never[];

const variantRows = [
  { id: 11, product_id: 10001, sku: "SW-30", title: "30ml", price: 150000, compare_price: 200000, stock: 10 },
  { id: 12, product_id: 10001, sku: "SW-60", title: "60ml", price: 250000, compare_price: null, stock: 10 },
] as never[];

function feedIds(xml: string) {
  return [...xml.matchAll(/<g:id>([^<]*)<\/g:id>/g)].map((match) => match[1]);
}

test("what the feed publishes is what the pixel sends", () => {
  const merged = mergeStorefrontCatalog(productRows, variantRows);
  const product = merged[0] as {
    productId: string;
    variants: { id: string }[];
  };

  const google = feedIds(generateGoogleCatalogXml(merged as never, "https://toko.example"));
  const meta = feedIds(generateMetaCatalogXml(merged as never, "https://toko.example"));

  // Both feeds publish the same identities.
  assert.deepEqual(google, meta);

  // ViewContent, on a page where the visitor has chosen nothing yet.
  const viewContent = defaultCatalogContentId(product);
  assert.ok(
    google.includes(viewContent as string),
    `ViewContent sends ${viewContent}, which the feed does not publish`,
  );

  // Variant selection never changes the product-level ads identity.
  for (const variant of product.variants) {
    const sent = product.productId;
    assert.ok(
      google.includes(sent),
      `variant ${variant.id} sends ${sent}, which the feed does not publish`,
    );
    assert.equal(sent, catalogProductId(product.productId));
  }

  assert.deepEqual(google, [product.productId]);
});

test("tracking surfaces use the canonical Product ID without rebuilding variant IDs", () => {
  const offenders: string[] = [];
  const roots = ["src/components/storefront/tracking", "src/scripts", "src/pages"];

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else if (/\.(ts|astro)$/.test(entry)) out.push(full);
    }
    return out;
  }

  for (const root of roots) {
    for (const file of walk(root)) {
      const source = readFileSync(file, "utf8");
      source.split("\n").forEach((line, index) => {
        if (!/content_ids/.test(line)) return;
        if (/contentId|content_id|productId|product_id/.test(line)) return;
        offenders.push(`${file}:${index + 1} → ${line.trim().slice(0, 90)}`);
      });
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "content_ids must carry the canonical Product ID. A mismatch does not error:\n  " +
      offenders.join("\n  "),
  );

  const trackingSources = [
    readFileSync("src/scripts/form-hybrid.ts", "utf8"),
    readFileSync("src/components/storefront/tracking/MetaThanksTracker.astro", "utf8"),
  ].join("\n");
  assert.doesNotMatch(trackingSources, /p\$\{productId\}-v\$\{/);
});

test("the display-safe catalogue id degrades instead of blanking a screen", () => {
  // A single short id used to throw inside the admin product list's own
  // filter, and a React render that throws returns an empty page.
  assert.equal(catalogProductIdOrNull(60001), "60001");
  for (const short of [1, 0, "", "abc", -5, 9999]) {
    assert.equal(catalogProductIdOrNull(short as number), null);
  }
});

test("one unpublishable row is skipped, not allowed to take the whole feed down", () => {
  // The strict identity function is what a *single* ads payload must call, and
  // it throws by design. Inside a feed loop that design was wrong: both routes
  // catch the throw and return a 500 stub, so a lone legacy row — an import, a
  // hand-inserted product, a database that predates the five-digit scheme —
  // meant Merchant Center and Meta Commerce fetched an empty catalog and
  // disapproved every product, not the one that could not be published.
  const merged = mergeStorefrontCatalog(
    [
      { id: 7, title: "Legacy Row", slug: "legacy-row", category: "Skincare", is_active: 1, image_url: "/a.webp" },
      { id: 10001, title: "Serum Wajah", slug: "serum-wajah", category: "Skincare", is_active: 1, image_url: "/b.webp" },
    ] as never[],
    [
      { id: 71, product_id: 7, sku: "L-1", title: "1", price: 90000, compare_price: null, stock: 5 },
      { id: 11, product_id: 10001, sku: "SW-30", title: "30ml", price: 150000, compare_price: null, stock: 10 },
    ] as never[],
  );

  for (const xml of [
    generateGoogleCatalogXml(merged as never, "https://toko.example"),
    generateMetaCatalogXml(merged as never, "https://toko.example"),
  ]) {
    assert.deepEqual(feedIds(xml), ["10001"]);
    assert.doesNotMatch(xml, /Legacy Row/);
  }

  // The same row on its own product page reports no catalog identity rather
  // than 500-ing the page: it still sells, it simply cannot be retargeted.
  const legacy = merged.find((product) => String((product as { productId: string }).productId) === "7");
  assert.equal(defaultCatalogContentId(legacy as never), undefined);
});

/**
 * Where the strict identity function may still be called.
 *
 * `catalogProductId` throws on a row that predates the five-digit scheme, and
 * that is correct for a single ads payload — a padded or guessed identity is
 * worse than none. It is wrong everywhere the throw escapes to something
 * larger than the row itself, and it had escaped in five places:
 *
 *   - both catalog feeds, where one legacy row returned the 500 stub for the
 *     whole catalog and Merchant Center read it as every product failing;
 *   - `getStorefrontProduct`, whose `.find` predicate runs against every
 *     product, so one legacy row 500'd the product page, the landing page,
 *     every form page, `/api/form-config` and `/api/v1/products/<slug>` — the
 *     entire storefront, not the bad row's own page;
 *   - `/api/v1/products`, where `paginated.map` failed the whole list;
 *   - `ProductForm.tsx`, where a throw in a React render blanks the form and
 *     leaves the operator unable to open or repair the product that needs it —
 *     the exact failure `catalogProductIdOrNull`'s own comment describes,
 *     fixed in ProductCatalog and missed here;
 *   - the three checkout form routes, which 500'd rather than selling.
 *
 * This scan is what stops a sixth. A strict call outside the allowlist below is
 * a new escape route until it is shown to be guarded.
 */
test("the throwing catalogue id is only called where a throw cannot escape", () => {
  const allowed = new Map([
    ["src/lib/catalog-feed.ts", "its own definition and null-returning wrapper"],
    ["src/lib/paid-order-purchase.ts", "wrapped in try/catch, per product"],
    ["src/pages/api/v1/products/[slug].ts", "behind a 404 for an unpublishable row"],
    ["src/pages/api/v1/products/index.ts", "behind a filter that drops unpublishable rows"],
  ]);

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else if (/\.(ts|tsx|astro)$/.test(entry) && !entry.endsWith(".test.ts")) out.push(full);
    }
    return out;
  }

  const offenders: string[] = [];
  for (const file of walk("src")) {
    const source = readFileSync(file, "utf8");
    source.split("\n").forEach((line, index) => {
      // `catalogProductIdOrNull` contains the shorter name; match the call only.
      if (!/\bcatalogProductId\s*\(/.test(line)) return;
      if (allowed.has(file)) return;
      offenders.push(`${file}:${index + 1} → ${line.trim().slice(0, 100)}`);
    });
  }

  assert.deepEqual(
    offenders,
    [],
    "a throwing catalogue id reached a surface that cannot absorb it:\n  " +
      offenders.join("\n  "),
  );

  // The allowlist must not outlive its entries: a file listed here that no
  // longer calls the strict function is stale guidance for the next reader.
  for (const [file, reason] of allowed) {
    assert.match(
      readFileSync(file, "utf8"),
      /\bcatalogProductId\s*\(/,
      `${file} is allowlisted (${reason}) but no longer calls it`,
    );
  }
});
