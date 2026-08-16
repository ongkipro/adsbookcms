import test from "node:test";
import assert from "node:assert/strict";
import {
  formatContentId,
  formatCatalogItemId,
  generateGoogleCatalogXml,
  generateMetaCatalogXml,
  type CatalogProduct,
} from "./catalog-feed.ts";

test("formatContentId enforces minimum 5-digit pattern lock", () => {
  assert.equal(formatContentId(1), "10001");
  assert.equal(formatContentId("10001"), "10001");
  assert.equal(formatContentId(4001), "14001");
  assert.equal(formatContentId(434683), "434683");
  assert.equal(formatContentId("abc"), "00abc");
});

test("formatCatalogItemId returns product ID as itemId for single-variant products", () => {
  const result = formatCatalogItemId("434683", 0, 1);
  assert.equal(result.itemId, "434683");
  assert.equal(result.itemGroupId, undefined);
});

test("formatCatalogItemId returns product ID for first variant of multi-variant products", () => {
  const result = formatCatalogItemId("14001", 0, 2);
  assert.equal(result.itemId, "14001");
  assert.equal(result.itemGroupId, undefined);
});

test("formatCatalogItemId returns indexed suffix and itemGroupId for secondary variants", () => {
  const result = formatCatalogItemId("14001", 1, 2);
  assert.equal(result.itemId, "14001_v2");
  assert.equal(result.itemGroupId, "14001");
});

test("generateGoogleCatalogXml emits valid g:id matching content_id and g:item_group_id", () => {
  const mockProducts: CatalogProduct[] = [
    {
      productId: 14001,
      slug: "bibit-sirsak",
      productName: "Bibit Sirsak Juara",
      category: "Pertanian",
      heroImage: "/images/hero.jpg",
      variants: [
        { id: 10, label: "Paket 1 Batang", price: 85000, sku: "variant_NO8meDAONBXBZr4lawMCaFOp" },
        { id: 11, label: "Paket 2 Batang", price: 150000 },
      ],
    },
  ];

  const xml = generateGoogleCatalogXml(mockProducts, "https://toko-uji.example");
  assert.ok(xml.includes("<g:id>14001</g:id>"));
  assert.ok(xml.includes("<g:id>14001_v2</g:id>"));
  assert.ok(xml.includes("<g:item_group_id>14001</g:item_group_id>"));
  assert.ok(xml.includes("<g:link>https://toko-uji.example/produk/bibit-sirsak</g:link>"));
  assert.ok(xml.includes("<g:price>85000 IDR</g:price>"));
});

test("generateGoogleCatalogXml emits g:sale_price when comparePrice is greater than price", () => {
  const mockProducts: CatalogProduct[] = [
    {
      productId: 16001,
      slug: "zivia-tote-bag",
      productName: "ZIVIA Tote Bag",
      category: "Tote Bag",
      heroImage: "/images/zivia.jpg",
      variants: [
        { id: 1, label: "Black", price: 128500, comparePrice: 300000 },
      ],
    },
  ];

  const xml = generateGoogleCatalogXml(mockProducts, "https://toko-uji.example");
  assert.ok(xml.includes("<g:price>300000 IDR</g:price>"));
  assert.ok(xml.includes("<g:sale_price>128500 IDR</g:sale_price>"));
  assert.ok(xml.includes("<g:google_product_category>6551</g:google_product_category>"));
});

test("generateMetaCatalogXml emits valid fb_product_category and matching content_id g:id", () => {
  const mockProducts: CatalogProduct[] = [
    {
      productId: 15005,
      slug: "pompa-air",
      productName: "Pompa Air Portable",
      category: "Alat Rumah Tangga",
      heroImage: "https://r2.example.com/pompa.jpg",
      variants: [{ id: 1, label: "Standard", price: 120000, sku: "variant_ABC123" }],
    },
  ];

  const xml = generateMetaCatalogXml(mockProducts, "https://toko-uji.example");
  assert.ok(xml.includes("<g:id>15005</g:id>"));
  assert.ok(!xml.includes("<g:item_group_id>"));
  assert.ok(xml.includes("<g:fb_product_category>"));
  assert.ok(xml.includes("<g:image_link>https://r2.example.com/pompa.jpg</g:image_link>"));
});
