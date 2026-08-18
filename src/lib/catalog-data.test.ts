import assert from "node:assert/strict";
import test from "node:test";
import type { Product } from "../data/products.ts";
import { mergeStorefrontCatalog } from "./catalog-data.ts";

function runtimePresentation(productId: string): Product {
  return {
    slug: "presentation-slug",
    productId,
    productName: "Presentation Name",
    contentName: "Merchant presentation",
    headline: "Merchant-authored headline",
    subheadline: "Merchant-authored subheadline",
    seoTitle: "Merchant SEO title",
    seoDescription: "Merchant SEO description",
    price: 1,
    image: "/images/adsbook-mark.webp",
    heroImage: "/images/adsbook-mark.webp",
    images: ["/images/adsbook-mark.webp"],
    tag: "Merchant tag",
    category: "Presentation category",
    relatedCategories: ["Merchant category"],
    description: "Merchant-authored description",
    benefits: ["Merchant benefit"],
    keyPoints: ["Merchant key point"],
    idealFor: ["Merchant audience"],
    offerText: "Merchant offer",
    ctaText: "Merchant CTA",
    reviews: [],
    variants: [],
  };
}

const completeProductRow = {
  id: 50001,
  title: "Pupuk Organik Super",
  slug: "pupuk-organik-super",
  category: "Pupuk",
  image_url: "/assets/uploads/pupuk.webp",
  is_active: 1,
};

const completeVariantRows = [
  {
    id: 60001,
    product_id: 50001,
    sku: "PUPUK-1L",
    title: "1 Liter",
    price: 120000,
    compare_price: 150000,
    stock: 50,
  },
  {
    id: 60002,
    product_id: 50001,
    sku: "PUPUK-2L",
    title: "2 Liter",
    price: 200000,
    compare_price: null,
    stock: 0,
  },
];

test("empty D1 product rows always produce an empty public catalog", () => {
  assert.deepEqual(
    mergeStorefrontCatalog([], [], [runtimePresentation("50001")]),
    [],
  );
});

test("D1 rows are the sole source of public identity, image, price, stock, and variants", () => {
  const products = mergeStorefrontCatalog(
    [completeProductRow],
    completeVariantRows,
    [
      runtimePresentation("50001"),
      runtimePresentation("99999"),
    ],
  );

  assert.equal(products.length, 1);
  assert.equal(products[0].productId, "50001");
  assert.equal(products[0].productName, "Pupuk Organik Super");
  assert.equal(products[0].slug, "pupuk-organik-super");
  assert.equal(products[0].category, "Pupuk");
  assert.equal(products[0].image, "/assets/uploads/pupuk.webp");
  assert.equal(products[0].heroImage, "/assets/uploads/pupuk.webp");
  assert.deepEqual(products[0].images, ["/assets/uploads/pupuk.webp"]);
  assert.equal(products[0].headline, "Merchant-authored headline");
  assert.equal(products[0].price, 120000);
  assert.deepEqual(products[0].variants, [
    {
      catalogId: 60001,
      sku: "PUPUK-1L",
      id: "60001",
      label: "1 Liter",
      price: 120000,
      comparePrice: 150000,
    },
  ]);
  assert.ok(!products.some((product) => product.productId === "99999"));
});

test("active products fail closed without complete merchant data", () => {
  const invalidProducts = [
    { ...completeProductRow, is_active: 0 },
    { ...completeProductRow, title: " " },
    { ...completeProductRow, slug: " " },
    { ...completeProductRow, image_url: null },
  ];

  for (const product of invalidProducts) {
    assert.deepEqual(
      mergeStorefrontCatalog([product], completeVariantRows),
      [],
    );
  }

  for (const variant of [
    { ...completeVariantRows[0], title: " " },
    { ...completeVariantRows[0], price: 0 },
    { ...completeVariantRows[0], stock: 0 },
    { ...completeVariantRows[0], stock: null },
  ]) {
    assert.deepEqual(
      mergeStorefrontCatalog([completeProductRow], [variant]),
      [],
    );
  }
});

test("missing D1 product image is never replaced with an AdsBookCMS asset", () => {
  const products = mergeStorefrontCatalog(
    [{ ...completeProductRow, image_url: null }],
    completeVariantRows,
    [runtimePresentation("50001")],
  );

  assert.deepEqual(products, []);
  assert.doesNotMatch(JSON.stringify(products), /adsbook-mark\.webp/);
});
