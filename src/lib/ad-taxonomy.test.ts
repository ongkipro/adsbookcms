import assert from "node:assert/strict";
import test from "node:test";
import { getAdTaxonomy } from "./ad-taxonomy.ts";

test("automatically classifies agricultural/fertilizer products to Google Category ID 2863", () => {
  const result = getAdTaxonomy("Pertanian", "Pupuk Sawit Ganoderma", "Pupuk pelindung akar kelapa sawit");
  assert.equal(result.googleCategoryId, 2863);
  assert.equal(result.googleCategoryName, "Home & Garden > Lawn & Garden > Gardening > Fertilizer");
  assert.equal(result.metaCategoryName, "Home & Garden > Lawn & Garden > Gardening > Fertilizer");
  assert.equal(result.productType, "Pertanian > Pupuk & Nutrisi");
});

test("automatically classifies skincare/kojic products to Google Category ID 2547", () => {
  const result = getAdTaxonomy("Kecantikan", "Kojic Soap Soap Bar Glowing", "Sabun pemutih wajah dan badan");
  assert.equal(result.googleCategoryId, 2547);
  assert.equal(result.googleCategoryName, "Health & Beauty > Personal Care > Cosmetics > Skin Care");
  assert.equal(result.metaCategoryName, "Health & Beauty > Personal Care > Cosmetics > Skin Care");
  assert.equal(result.productType, "Kecantikan & Perawatan > Skincare");
});

test("automatically classifies herbal stamina products to Google Category ID 642", () => {
  const result = getAdTaxonomy("Kesehatan", "Madu Pinang Muda Stamina Pria", "Herbal alami penambah vitalitas");
  assert.equal(result.googleCategoryId, 642);
  assert.equal(result.googleCategoryName, "Health & Beauty > Health Care > Biotherapy & Alternative Medicine > Herbal Supplements");
  assert.equal(result.metaCategoryName, "Health & Beauty > Health Care > Fitness & Nutrition > Vitamins & Supplements");
  assert.equal(result.productType, "Kesehatan > Suplemen Herbal");
});

test("automatically classifies kitchen sharpening tools to Google Category ID 1630", () => {
  const result = getAdTaxonomy("Perkakas", "Pengasah Pisau Portable", "Alat asahan pisau dapur serbaguna");
  assert.equal(result.googleCategoryId, 1630);
  assert.equal(result.googleCategoryName, "Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils");
  assert.equal(result.metaCategoryName, "Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils");
  assert.equal(result.productType, "Perkakas & Rumah Tangga > Alat Dapur");
});

test("an unclassifiable product is submitted with no category at all", () => {
  // The fallback used to be Handbags (6551), justified by a bundled handbag
  // catalogue that no longer exists — an install starts empty and sells whatever
  // its merchant sells. Asserting a category the product cannot know is grounds
  // for a Merchant Center misrepresentation suspension; both platforms treat the
  // field as optional and Google auto-classifies what is omitted.
  const result = getAdTaxonomy("Custom Category", "Unclassified Item", "");
  assert.equal(result.googleCategoryId, undefined);
  assert.equal(result.googleCategoryName, undefined);
  assert.equal(result.metaCategoryName, undefined);
  // productType is free text on the merchant's own axis, so it stays useful.
  assert.equal(result.productType, "Umum > Custom Category");
});

test("a description full of foreign keywords cannot outvote the product name", () => {
  // Unweighted keyword counting shipped this handbag as fertilizer: the description
  // hits buah + daun + tanaman, the title only tas + selempang.
  const result = getAdTaxonomy(
    "Tas Wanita",
    "Tas Selempang Kulit Sintetis",
    "Kulit sintetis, cocok untuk buah tangan; ringan seperti daun kering dan awet dipakai di antara tanaman hias",
  );
  assert.equal(result.googleCategoryId, 6551);
  // Proves the handbag rule won on merit rather than the request falling through
  // to the default, which would have produced "Umum > Tas Wanita".
  assert.equal(result.productType, "Fashion Wanita > Tas & Aksesori");
});

test("a skincare product is not reclassified as soap by its own usage notes", () => {
  const result = getAdTaxonomy(
    "Kecantikan",
    "Serum Wajah Glowing",
    "Aman untuk kulit sensitif; pakai setelah mandi dengan sabun cleanser atau body wash, bukan soap batangan",
  );
  assert.equal(result.googleCategoryId, 2547);
  assert.equal(result.productType, "Kecantikan & Perawatan > Skincare");
});

test("keywords match whole words, not substrings inside other words", () => {
  // "kertas" contains "tas", "bagus" contains "bag" — two phantom handbag hits that
  // used to tie with, and therefore beat, the two real electronics hits.
  const result = getAdTaxonomy(
    "Elektronik",
    "Kabel Data",
    "Sebuah kabel bagus, dibungkus kertas daur ulang, panjang 1 meter",
  );
  assert.equal(result.googleCategoryId, 222);
  assert.equal(result.productType, "Elektronik & Gadget");
});

test("an ambiguous product emits no category rather than guessing", () => {
  // "sabun" (soap) and "serum" (skin care) score identically and nothing else
  // separates them. A coin flip in a Merchant Center feed is the worst option.
  const result = getAdTaxonomy("Perawatan", "Sabun Serum", "");
  assert.equal(result.googleCategoryId, undefined);
  assert.equal(result.productType, "Umum > Perawatan");
});
