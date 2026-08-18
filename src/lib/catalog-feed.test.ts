import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogProductId,
  defaultCatalogContentId,
  generateGoogleCatalogXml,
  generateMetaCatalogXml,
  type CatalogProduct,
} from "./catalog-feed.ts";

test("catalog identity is the numeric Product ID with a five-digit minimum", () => {
  assert.equal(catalogProductId(10000), "10000");
  assert.equal(catalogProductId("434683"), "434683");
  for (const invalid of [9999, "010000", "p10000", "product-slug", Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => catalogProductId(invalid), /minimal 5 digit/i);
  }
});

test("a page with a sellable variant points at its Product ID, or at nothing", () => {
  assert.equal(
    defaultCatalogContentId({ productId: 10007, variants: [{ id: 21 }, { id: 22 }] }),
    "10007",
  );
  // No variants means no catalog item. Sending an id that matches nothing is
  // worse than sending none: Meta reports it as a match the merchant cannot act on.
  assert.equal(defaultCatalogContentId({ productId: 7, variants: [] }), undefined);
  assert.equal(defaultCatalogContentId({ productId: 7 }), undefined);
});

test("Google feed emits one product-grain item with g:id matching Product ID", () => {
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
  assert.deepEqual([...xml.matchAll(/<g:id>([^<]+)<\/g:id>/g)].map((match) => match[1]), ["14001"]);
  assert.ok(!xml.includes("<g:item_group_id>"));
  assert.ok(!xml.includes("<g:size>"));
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

test("a feed omits the ad category it cannot determine", () => {
  // Both platforms treat the category as optional and Google auto-classifies
  // what is missing. Asserting a wrong one is grounds for a Merchant Center
  // misrepresentation suspension — which is what shipping every unclassified
  // product as a handbag would have been, once the bundled handbag catalogue
  // that justified that default was removed.
  const unclassifiable: CatalogProduct[] = [
    {
      productId: 10003,
      slug: "barang-baru",
      productName: "Barang Baru",
      category: "Kategori Sendiri",
      heroImage: "/images/adsbook-mark.webp",
      variants: [{ id: 9, label: "Standar", price: 50000 }],
    },
  ];

  const google = generateGoogleCatalogXml(unclassifiable, "https://toko-uji.example");
  const meta = generateMetaCatalogXml(unclassifiable, "https://toko-uji.example");

  assert.ok(!google.includes("<g:google_product_category>"));
  assert.ok(!meta.includes("<g:google_product_category>"));
  assert.ok(!meta.includes("<g:fb_product_category>"));
  // The merchant's own free-text axis is still worth sending.
  assert.ok(google.includes("<g:product_type>Umum &gt; Kategori Sendiri</g:product_type>"));
  // And a product the rules *can* place still carries its category.
  const known = generateGoogleCatalogXml(
    [{ ...unclassifiable[0], category: "Tas Wanita", productName: "Tas Selempang Kulit" }],
    "https://toko-uji.example",
  );
  assert.ok(known.includes("<g:google_product_category>"));
});
