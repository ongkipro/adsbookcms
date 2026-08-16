import assert from "node:assert/strict";
import test from "node:test";
import type { Product } from "../data/products.ts";
import { mergeStorefrontCatalog } from "./catalog-data.ts";

function product(slug: string, productId: string): Product {
  return {
    slug,
    productId,
    productName: slug,
    contentName: `${slug} content`,
    headline: `${slug} headline`,
    subheadline: `${slug} subheadline`,
    seoTitle: slug,
    seoDescription: slug,
    price: 100000,
    comparePrice: 150000,
    image: `/images/${slug}.webp`,
    heroImage: `/images/${slug}.webp`,
    tag: slug,
    category: slug,
    relatedCategories: [],
    description: slug,
    benefits: [],
    keyPoints: [],
    idealFor: [],
    offerText: slug,
    ctaText: slug,
    reviews: [],
    variants: [
      { id: `${slug}-variant`, label: `${slug} - 500ml`, price: 100000 },
    ],
  };
}

const alpha = product("alpha", "10001");
const beta = product("beta", "10002");

test("D1 product identity and sellable variants override editorial catalog operations", () => {
  const products = mergeStorefrontCatalog(
    [alpha, beta],
    [
      {
        id: 10001,
        title: "Alpha Admin",
        slug: "alpha-admin",
        category: "Admin Category",
        image_url: "/assets/uploads/alpha.webp",
        is_active: 1,
      },
    ],
    [
      {
        id: 20001,
        product_id: 10001,
        title: "500ml",
        price: 151000,
        compare_price: 229000,
        stock: 4,
      },
      {
        id: 20002,
        product_id: 10001,
        title: "1 Liter",
        price: 300000,
        compare_price: 349000,
        stock: 0,
      },
    ],
  );

  const merged = products.find(
    (product) => product.productId === alpha.productId,
  );
  assert.ok(merged);
  assert.equal(merged.productName, "Alpha Admin");
  assert.equal(merged.slug, "alpha-admin");
  assert.equal(merged.category, "Admin Category");
  assert.equal(merged.image, "/assets/uploads/alpha.webp");
  assert.equal(merged.price, 151000);
  assert.deepEqual(merged.variants, [
    {
      catalogId: 20001,
      id: "20001",
      label: "500ml",
      price: 151000,
      comparePrice: 229000,
    },
  ]);
  assert.ok(!products.some((product) => product.productId === beta.productId));
});

test("inactive or checkout-incomplete D1 products are hidden from storefront output", () => {
  const baseRow = {
    id: 10001,
    title: "Alpha",
    slug: "alpha",
    category: null,
    image_url: null,
  };

  assert.deepEqual(
    mergeStorefrontCatalog([alpha], [{ ...baseRow, is_active: 0 }], []),
    [],
  );
  assert.deepEqual(
    mergeStorefrontCatalog(
      [alpha],
      [{ ...baseRow, is_active: 1 }],
      [
        {
          id: 20001,
          product_id: 10001,
          title: "500ml",
          price: 0,
          compare_price: null,
          stock: 10,
        },
      ],
    ),
    [],
  );
});
test("custom D1 products created manually without editorial match are synthesized correctly", () => {
  const customProductRow = {
    id: 50001,
    title: "Pupuk Organik Super",
    slug: "pupuk-organik-super",
    category: "Pupuk",
    image_url: "/uploads/pupuk.webp",
    is_active: 1,
  };
  const customVariantRows = [
    {
      id: 60001,
      product_id: 50001,
      sku: "PUPUK-1L",
      title: "1 Liter",
      price: 120000,
      compare_price: 150000,
      stock: 50,
    },
  ];

  const products = mergeStorefrontCatalog([], [customProductRow], customVariantRows);
  assert.equal(products.length, 1);
  assert.equal(products[0].productId, "50001");
  assert.equal(products[0].productName, "Pupuk Organik Super");
  assert.equal(products[0].slug, "pupuk-organik-super");
  assert.equal(products[0].price, 120000);
  assert.equal(products[0].variants[0].label, "1 Liter");
  assert.equal(products[0].headline, "Pupuk Organik Super");
  assert.equal(products[0].seoTitle, "Pupuk Organik Super");
  assert.deepEqual(products[0].images, ["/uploads/pupuk.webp"]);
  assert.deepEqual(products[0].benefits, []);
  assert.deepEqual(products[0].keyPoints, []);
  assert.deepEqual(products[0].idealFor, []);
  assert.doesNotMatch(
    JSON.stringify(products[0]),
    /Korean|original|garansi|COD|gratis ongkir/i,
  );
});
