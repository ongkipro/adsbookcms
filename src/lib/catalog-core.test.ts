import assert from "node:assert/strict";
import test from "node:test";

import { getStorefrontProduct, getStorefrontProducts } from "./catalog.ts";

/**
 * One legacy short-id row (predates the five-digit catalogue scheme) sorted
 * ahead of a normal long-id row — the exact shape that caused A-208:
 * `catalogProductIdOrNull` on the legacy row must return null rather than
 * throw, so the search keeps scanning to the real match.
 */
function fakeDatabase() {
  const products = [
    {
      id: 3,
      title: "Legacy Item",
      slug: "legacy-item",
      category: "Umum",
      image_url: "/legacy.jpg",
      is_active: 1,
      created_at: "2024-01-01",
    },
    {
      id: 100000,
      title: "Modern Item",
      slug: "modern-item",
      category: "Umum",
      image_url: "/modern.jpg",
      is_active: 1,
      created_at: "2024-02-01",
    },
  ];
  const variants = [
    { id: 1, product_id: 3, sku: "LEG-1", title: "Default", price: 10000, stock: 5 },
    { id: 2, product_id: 100000, sku: "MOD-1", title: "Default", price: 20000, stock: 5 },
  ];

  return {
    async batch() {
      return [{ results: products }, { results: variants }];
    },
    prepare() {
      return {
        async all() {
          return { results: [] };
        },
      };
    },
  } as unknown as D1Database;
}

function locals(database: D1Database) {
  return { runtimeEnv: { OMS_DB: database } } as unknown as App.Locals;
}

test("getStorefrontProducts merges D1 product and variant rows into the storefront shape", async () => {
  const products = await getStorefrontProducts(locals(fakeDatabase()));
  assert.equal(products.length, 2);
  assert.deepEqual(
    products.map((p) => p.slug).sort(),
    ["legacy-item", "modern-item"],
  );
});

test("a legacy short-id row does not stop the search from reaching a later match by slug", async () => {
  const product = await getStorefrontProduct(locals(fakeDatabase()), "modern-item");
  assert.equal(product?.productId, "100000");
});

test("a product is found by its raw numeric Product ID", async () => {
  const product = await getStorefrontProduct(locals(fakeDatabase()), "100000");
  assert.equal(product?.slug, "modern-item");
});

test("a product is found by its ads catalogue id, derived from the long Product ID", async () => {
  const product = await getStorefrontProduct(locals(fakeDatabase()), "100000");
  assert.equal(product?.slug, "modern-item");
  assert.equal(String(product?.catalogId), "100000");
});

test("the legacy short-id row itself is still resolvable by slug and productId, just never by a catalogue id", async () => {
  const bySlug = await getStorefrontProduct(locals(fakeDatabase()), "legacy-item");
  assert.equal(bySlug?.productId, "3");

  const byCatalogId = await getStorefrontProduct(locals(fakeDatabase()), "00003");
  assert.equal(byCatalogId, undefined);
});

test("an unmatched key resolves to undefined rather than throwing", async () => {
  const product = await getStorefrontProduct(locals(fakeDatabase()), "does-not-exist");
  assert.equal(product, undefined);
});
