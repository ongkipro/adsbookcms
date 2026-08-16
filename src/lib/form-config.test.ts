import assert from "node:assert/strict";
import test from "node:test";
import type { Product } from "../data/products.ts";
import {
  buildEmbedFormUrls,
  buildFormUrls,
  parseFormMode,
  resolveFormVariant,
} from "./form-config.ts";

const product = {
  catalogId: 10001,
  productId: "10001",
  variants: [
    {
      catalogId: 20001,
      sku: "AUS-500ML",
      id: "20001",
      label: "Aussie - 500ml",
      price: 150000,
    },
    {
      catalogId: 20002,
      sku: "AUS-1L",
      id: "20002",
      label: "Aussie - 1 Liter",
      price: 300000,
    },
  ],
} as Product;

test("form modes accept only middle, full, and hybrid", () => {
  assert.equal(parseFormMode("middle"), "middle");
  assert.equal(parseFormMode("full"), "full");
  assert.equal(parseFormMode("hybrid"), "hybrid");
  assert.equal(parseFormMode("adaptive"), null);
});

test("form variants resolve only by canonical D1 variant ID", () => {
  assert.equal(resolveFormVariant(product)?.catalogId, 20001);
  assert.equal(resolveFormVariant(product, "20002")?.catalogId, 20002);
  assert.equal(resolveFormVariant(product, "AUS-1L"), undefined);
  assert.equal(resolveFormVariant(product, "99999999"), undefined);
});

test("generated URLs bind canonical product and variant IDs across all modes", () => {
  assert.deepEqual(buildFormUrls(product, product.variants[1]), {
    middle: "/middle-form?product_id=10001&variant_id=20002",
    full: "/full-form?product_id=10001&variant_id=20002",
    hybrid: "/hybrid-form?product_id=10001&variant_id=20002",
  });
});

test("generated embed URLs keep mode and canonical IDs explicit", () => {
  assert.deepEqual(buildEmbedFormUrls(product, product.variants[1]), {
    middle: "/embed/form?mode=middle&product_id=10001&variant_id=20002",
    full: "/embed/form?mode=full&product_id=10001&variant_id=20002",
    hybrid: "/embed/form?mode=hybrid&product_id=10001&variant_id=20002",
  });
});
