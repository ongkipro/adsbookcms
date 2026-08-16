import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { mergeStorefrontCatalog } from "./catalog-data.ts";
import {
  catalogItemGroupId,
  catalogItemId,
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
    id: 1,
    title: "Serum Wajah",
    slug: "serum-wajah",
    category: "Skincare",
    is_active: 1,
    image_url: "/images/serum/1.webp",
  },
] as never[];

const variantRows = [
  { id: 11, product_id: 1, sku: "SW-30", title: "30ml", price: 150000, compare_price: 200000, stock: 10 },
  { id: 12, product_id: 1, sku: "SW-60", title: "60ml", price: 250000, compare_price: null, stock: 10 },
] as never[];

function feedIds(xml: string) {
  return [...xml.matchAll(/<g:id>([^<]*)<\/g:id>/g)].map((match) => match[1]);
}

test("what the feed publishes is what the pixel sends", () => {
  const merged = mergeStorefrontCatalog([], productRows, variantRows);
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

  // AddToCart / InitiateCheckout / Purchase, once a variant is chosen. This is
  // the string `form-hybrid.ts` and `MetaThanksTracker.astro` build by hand from
  // the product id and the variant radio's value, so it is spelled out here
  // rather than imported — an inline script cannot import, and a shared helper
  // that both sides call would prove nothing about what the scripts actually do.
  for (const variant of product.variants) {
    const sent = `p${product.productId}-v${variant.id}`;
    assert.ok(
      google.includes(sent),
      `checkout sends ${sent}, which the feed does not publish`,
    );
    assert.equal(sent, catalogItemId(product.productId, variant.id));
  }

  // Every published id belongs to some variant — the feed invents nothing.
  assert.equal(google.length, product.variants.length);

  // And the group is never itself an item, so a variant can never be confused
  // with the product it belongs to.
  assert.ok(!google.includes(catalogItemGroupId(product.productId)));
});

test("no tracking surface sends a bare row id as content_ids", () => {
  // The defect was not a wrong constant, it was a wrong *kind* of value: a
  // database row id where a catalog identity was required. Nothing in the type
  // system distinguishes those, so it is checked here.
  const offenders: string[] = [];
  const roots = ["src/components/tracking", "src/scripts", "src/pages"];

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
        // A catalog identity is either built here as `p…-v…`, or it arrives in
        // a variable already named for what it is.
        if (/contentId|content_id|catalogItemId|`p\$\{/.test(line)) return;
        offenders.push(`${file}:${index + 1} → ${line.trim().slice(0, 90)}`);
      });
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "content_ids must carry a catalog item id (`p{product}-v{variant}`), not a " +
      "row id. A mismatch does not error — it silently retargets nobody:\n  " +
      offenders.join("\n  "),
  );
});
