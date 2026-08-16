import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogItemGroupId,
  catalogItemId,
  defaultCatalogContentId,
  generateGoogleCatalogXml,
  generateMetaCatalogXml,
  type CatalogProduct,
} from "./catalog-feed.ts";

test("a catalog id is derived from keys that never change", () => {
  // Not the SKU, which both platforms recommend and this schema lets a merchant
  // edit or leave null — Google's rule is that an id, once assigned, is never
  // changed and never reused. The AUTOINCREMENT keys satisfy that; SKU does not.
  assert.equal(catalogItemId(1, 11), "p1-v11");
  assert.equal(catalogItemGroupId(1), "p1");

  // An item id is never equal to a group id, so a variant cannot be mistaken
  // for the product it belongs to. The previous scheme produced exactly that
  // collision: the first variant's id *was* the group id.
  assert.notEqual(catalogItemId(1, 11), catalogItemGroupId(1));

  // Google caps both at 50 characters of alphanumerics, dashes and underscores.
  const wide = catalogItemId(999999999, 999999999);
  assert.ok(wide.length <= 50);
  assert.match(wide, /^[A-Za-z0-9_-]+$/);
});

test("a page with no chosen variant points at the first one, or at nothing", () => {
  assert.equal(
    defaultCatalogContentId({ productId: 7, variants: [{ id: 21 }, { id: 22 }] }),
    "p7-v21",
  );
  // No variants means no catalog item. Sending an id that matches nothing is
  // worse than sending none: Meta reports it as a match the merchant cannot act on.
  assert.equal(defaultCatalogContentId({ productId: 7, variants: [] }), undefined);
  assert.equal(defaultCatalogContentId({ productId: 7 }), undefined);
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
  assert.ok(xml.includes("<g:id>p14001-v10</g:id>"));
  assert.ok(xml.includes("<g:id>p14001-v11</g:id>"));
  // Both variants carry the group. Previously only the second did, so the first
  // was published as an orphan whose id collided with the group id.
  assert.equal(xml.match(/<g:item_group_id>p14001<\/g:item_group_id>/g)?.length, 2);
  // Google refuses a group whose members carry no variant-identifying attribute.
  assert.ok(xml.includes("<g:size>Paket 1 Batang</g:size>"));
  assert.ok(xml.includes("<g:size>Paket 2 Batang</g:size>"));
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
  assert.ok(xml.includes("<g:id>p15005-v1</g:id>"));
  assert.ok(!xml.includes("<g:item_group_id>"));
  assert.ok(xml.includes("<g:fb_product_category>"));
  assert.ok(xml.includes("<g:image_link>https://r2.example.com/pompa.jpg</g:image_link>"));
});
