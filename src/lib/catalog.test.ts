import assert from "node:assert/strict";
import test from "node:test";
import { mergeStorefrontCatalog } from "./catalog-data.ts";
import { catalogProductIdOrNull } from "./catalog-feed.ts";

/**
 * `getStorefrontProduct` itself needs D1, a tenant and the runtime content
 * layer, so what is exercised here is its lookup predicate against a real
 * merged catalogue — which is where the defect lived, not in the plumbing.
 */
const lookup = (
  products: { slug: string; productId: string; catalogId?: unknown }[],
  key: string,
) =>
  products.find(
    (product) =>
      product.slug === key ||
      product.productId === key ||
      String(product.catalogId) === key ||
      catalogProductIdOrNull(product.productId) === key,
  );

function catalogue() {
  return mergeStorefrontCatalog(
    [
      // A row from before the five-digit scheme: an import, or a hand-inserted
      // product. `catalogProductIdOrNull` documents that these exist.
      { id: 7, title: "Legacy Row", slug: "legacy-row", category: "Skincare", is_active: 1, image_url: "/a.webp" },
      { id: 10001, title: "Serum Wajah", slug: "serum-wajah", category: "Skincare", is_active: 1, image_url: "/b.webp" },
    ] as never[],
    [
      { id: 71, product_id: 7, sku: null, title: "1", price: 90000, compare_price: null, stock: 1 },
      { id: 11, product_id: 10001, sku: "SW-30", title: "30ml", price: 150000, compare_price: null, stock: 10 },
    ] as never[],
  ) as { slug: string; productId: string; catalogId?: unknown }[];
}

/**
 * The strict `catalogProductId` throws on a legacy row, and this predicate runs
 * against every product until one matches. With the strict function here, a
 * single legacy row sorted ahead of the match threw before the match was
 * reached — and nothing catches it, so the product page, the landing page,
 * every form page, `/api/form-config` and `/api/v1/products/<slug>` all
 * answered 500. One bad row took the whole storefront down, not its own page.
 */
test("a legacy product row cannot break the lookup of every other product", () => {
  const products = catalogue();

  assert.equal(lookup(products, "serum-wajah")?.productId, "10001");
  assert.equal(lookup(products, "10001")?.slug, "serum-wajah");
  // The legacy row still answers on the identities it does have.
  assert.equal(lookup(products, "legacy-row")?.productId, "7");
  assert.equal(lookup(products, "7")?.slug, "legacy-row");
  // It simply never matches on a catalogue identity, because it has none.
  assert.equal(catalogProductIdOrNull("7"), null);
  assert.equal(lookup(products, "00007"), undefined);
  // An unknown key is a miss, not a throw.
  assert.equal(lookup(products, "tidak-ada"), undefined);
});

/**
 * `/api/v1/products` hands a caller the numeric Product ID as `content_id`.
 * Handing it straight back must resolve, or the documented list/detail round
 * trip 404s on the value the API itself just returned.
 */
test("the Product ID the API publishes resolves back to its product", () => {
  const products = catalogue();
  const serum = products.find((p) => p.slug === "serum-wajah");
  assert.ok(serum);
  const published = catalogProductIdOrNull(serum.productId);
  assert.equal(published, "10001");
  assert.equal(lookup(products, String(published))?.slug, "serum-wajah");
});
