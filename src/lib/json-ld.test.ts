import assert from "node:assert/strict";
import test from "node:test";

import { buildProductJsonLd } from "./json-ld.ts";

const baseInput = {
  siteUrl: "https://shop.example/",
  organization: {
    name: "Merchant Example",
    logo: "/logo.webp",
  },
  product: {
    name: "Produk Contoh",
    description: "Deskripsi produk dari merchant.",
    image: "/produk/contoh.webp",
    url: "/produk/contoh",
  },
};

test("product offers omit unstored return, shipping, and validity claims", () => {
  const schema = buildProductJsonLd({
    ...baseInput,
    product: {
      ...baseInput.product,
      offers: [
        {
          price: 125_000,
          availability: "InStock",
        },
      ],
    },
  });
  const offer = schema.offers as Record<string, unknown>;

  assert.equal(Object.hasOwn(offer, "priceValidUntil"), false);
  assert.equal(Object.hasOwn(offer, "hasMerchantReturnPolicy"), false);
  assert.equal(Object.hasOwn(offer, "shippingDetails"), false);
});

test("product offers preserve an explicitly provided validity date", () => {
  const schema = buildProductJsonLd({
    ...baseInput,
    product: {
      ...baseInput.product,
      offers: [
        {
          price: 125_000,
          priceValidUntil: "2026-12-31",
          availability: "InStock",
        },
      ],
    },
  });
  const offer = schema.offers as Record<string, unknown>;

  assert.equal(offer.priceValidUntil, "2026-12-31");
  assert.equal(Object.hasOwn(offer, "hasMerchantReturnPolicy"), false);
  assert.equal(Object.hasOwn(offer, "shippingDetails"), false);
});
