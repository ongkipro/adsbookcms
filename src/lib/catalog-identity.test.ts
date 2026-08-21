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
