import { getAdTaxonomy } from "./ad-taxonomy.ts";

export type CatalogProductVariant = {
  id: number | string;
  label: string;
  price: number;
  comparePrice?: number;
  sku?: string;
};

export type CatalogProduct = {
  productId: number | string;
  catalogId?: number | string;
  slug: string;
  productName: string;
  category?: string;
  headline?: string;
  description?: string;
  seoDescription?: string;
  heroImage: string;
  variants: CatalogProductVariant[];
};

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * The catalog identity scheme, and the one rule that governs everything here:
 * the `id` a feed publishes must be **exactly** the string the Pixel and CAPI
 * send as `content_ids`, or Advantage+ and Dynamic Product Ads have nothing to
 * match and catalog retargeting is silently dead.
 *
 * It was dead. The feed published `10001`, derived by adding 10000 to the row
 * id; the admin screen showed the operator that same `10001`; and the Pixel
 * sent the raw row id, `1`. Three values for one product.
 *
 * Two constraints decide the shape, and neither is a length:
 *
 * - **Stable forever.** Google: "Once you've assigned an ID to a product, don't
 *   change it", and never reuse it, even for a deleted product. That rules out
 *   SKU as the basis, despite both platforms recommending it — `sku` here is
 *   nullable and merchant-editable, so it is exactly the thing that changes.
 *   The D1 AUTOINCREMENT keys never change and are never handed out twice.
 * - **Distinguishable in transit.** Nothing in either specification demands a
 *   minimum length or digits-only, but a bare `1` is fragile in the places
 *   feeds actually travel: spreadsheet and CSV coercion, leading zeros dropped,
 *   collisions when two sources are merged. A prefix costs three characters and
 *   removes all of it — and makes the id readable, so `p1-v12` says what it is
 *   where `12` does not.
 *
 * Limits, for reference: Google `id` and `item_group_id` are 1–50 characters of
 * alphanumerics, underscores and dashes; Meta allows 100. `p{n}-v{n}` stays
 * inside the tighter of the two until a store has ~10^20 products.
 */

/** The catalog item. One per *variant*, because the feed is variant-level. */
export function catalogItemId(
  productId: number | string,
  variantId: number | string,
): string {
  return `p${String(productId).trim()}-v${String(variantId).trim()}`;
}

/** The group every variant of one product shares. Never used as an item id. */
export function catalogItemGroupId(productId: number | string): string {
  return `p${String(productId).trim()}`;
}

/**
 * The content id for a page where no variant has been chosen yet — a product
 * detail page, a landing page. The feed is variant-level, so there is no
 * product-level item to point at; the first variant is the one the page is
 * already showing a price for, which makes it the honest default.
 *
 * Returns `undefined` rather than a guess when the product has no variants.
 * A `content_ids` that matches nothing in the catalog is worse than none: it
 * reports a match rate that is real to Meta and meaningless to the merchant.
 */
export function defaultCatalogContentId(product: {
  productId: number | string;
  variants?: readonly { id: number | string }[];
}): string | undefined {
  const first = product.variants?.[0];
  if (!first) return undefined;
  return catalogItemId(product.productId, first.id);
}

/**
 * Google will not accept an `item_group_id` unless the grouped items are also
 * distinguishable by a variant attribute — colour, size, material, pattern.
 * The feed previously submitted the group with none of them, which is a common
 * reason for a feed to be disapproved outright.
 *
 * lazy: every variant label goes out as `g:size`, whatever axis it really is.
 * `product_variants` records one free-text label ("30ml", "Merah", "isi 2") and
 * nothing that says which attribute it varies, so there is nothing to map from.
 * `size` is free text on Google's side, so a colour shipped as a size is
 * imprecise rather than invalid. The upgrade is a `variant_axis` column on
 * `product_variants`, at which point this picks the matching tag.
 */
function variantAttributeXml(label: string, totalVariants: number): string {
  if (totalVariants < 2) return "";
  const value = label.trim();
  if (!value) return "";
  return `\n      <g:size>${escapeXml(value)}</g:size>`;
}

export function generateGoogleCatalogXml(
  products: CatalogProduct[],
  siteOrigin: string,
  title?: string,
  description?: string,
): string {
  const origin = siteOrigin.replace(/\/$/, "");
  const siteTitle = title || "AdsBookCMS Merchant Store";
  const siteDescription = description || "Solusi Produk Berkualitas";

  let itemsXml = "";

  for (const product of products) {
    if (!product.variants || product.variants.length === 0) continue;

    const taxonomy = getAdTaxonomy(product.category, product.productName, product.description || product.headline);
    const productLink = `${origin}/produk/${product.slug}`;
    const imageLink = product.heroImage.startsWith("http") ? product.heroImage : `${origin}${product.heroImage}`;

    product.variants.forEach((variant) => {
      const itemId = catalogItemId(product.productId, variant.id);
      // Every variant carries the group, including the first. It previously
      // did not, so a two-variant product published one grouped item and one
      // orphan whose id happened to equal the group id.
      const itemGroupId =
        product.variants.length > 1 ? catalogItemGroupId(product.productId) : undefined;
      const variantXml = variantAttributeXml(variant.label, product.variants.length);
      const titleText = product.variants.length > 1 ? `${product.productName} - ${variant.label}` : product.productName;
      const hasSale = typeof variant.comparePrice === "number" && variant.comparePrice > variant.price;
      const basePriceFormatted = `${hasSale ? variant.comparePrice : variant.price} IDR`;
      const salePriceXml = hasSale
        ? `\n      <g:sale_price>${escapeXml(`${variant.price} IDR`)}</g:sale_price>`
        : "";
      const itemDescription = product.seoDescription || product.headline || product.description || siteDescription;

      let groupXml = "";
      if (itemGroupId) {
        groupXml = `\n      <g:item_group_id>${escapeXml(itemGroupId)}</g:item_group_id>`;
      }

      itemsXml += `
    <item>
      <g:id>${escapeXml(itemId)}</g:id>${groupXml}
      <g:title>${escapeXml(titleText)}</g:title>
      <g:description>${escapeXml(itemDescription)}</g:description>
      <g:link>${escapeXml(productLink)}</g:link>
      <g:image_link>${escapeXml(imageLink)}</g:image_link>
      <g:availability>in_stock</g:availability>
      <g:price>${escapeXml(basePriceFormatted)}</g:price>${salePriceXml}${variantXml}
      <g:google_product_category>${taxonomy.googleCategoryId}</g:google_product_category>
      <g:product_type>${escapeXml(taxonomy.productType)}</g:product_type>
      <g:brand>${escapeXml(siteTitle)}</g:brand>
      <g:condition>new</g:condition>
      <g:identifier_exists>no</g:identifier_exists>${variant.sku ? `\n      <g:mpn>${escapeXml(variant.sku)}</g:mpn>` : ""}
    </item>`;
    });
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escapeXml(siteTitle)} - Google Merchant Catalog</title>
    <link>${escapeXml(origin)}</link>
    <description>${escapeXml(siteDescription)}</description>${itemsXml}
  </channel>
</rss>`;
}

export function generateMetaCatalogXml(
  products: CatalogProduct[],
  siteOrigin: string,
  title?: string,
  description?: string,
): string {
  const origin = siteOrigin.replace(/\/$/, "");
  const siteTitle = title || "AdsBookCMS Merchant Store";
  const siteDescription = description || "Solusi Produk Berkualitas";

  let itemsXml = "";

  for (const product of products) {
    if (!product.variants || product.variants.length === 0) continue;

    const taxonomy = getAdTaxonomy(product.category, product.productName, product.description || product.headline);
    const productLink = `${origin}/produk/${product.slug}`;
    const imageLink = product.heroImage.startsWith("http") ? product.heroImage : `${origin}${product.heroImage}`;

    product.variants.forEach((variant) => {
      const itemId = catalogItemId(product.productId, variant.id);
      // Every variant carries the group, including the first. It previously
      // did not, so a two-variant product published one grouped item and one
      // orphan whose id happened to equal the group id.
      const itemGroupId =
        product.variants.length > 1 ? catalogItemGroupId(product.productId) : undefined;
      const variantXml = variantAttributeXml(variant.label, product.variants.length);
      const titleText = product.variants.length > 1 ? `${product.productName} - ${variant.label}` : product.productName;
      const hasSale = typeof variant.comparePrice === "number" && variant.comparePrice > variant.price;
      const basePriceFormatted = `${hasSale ? variant.comparePrice : variant.price} IDR`;
      const salePriceXml = hasSale
        ? `\n      <g:sale_price>${escapeXml(`${variant.price} IDR`)}</g:sale_price>`
        : "";
      const itemDescription = product.seoDescription || product.headline || product.description || siteDescription;

      let groupXml = "";
      if (itemGroupId) {
        groupXml = `\n      <g:item_group_id>${escapeXml(itemGroupId)}</g:item_group_id>`;
      }

      itemsXml += `
    <item>
      <g:id>${escapeXml(itemId)}</g:id>${groupXml}
      <g:title>${escapeXml(titleText)}</g:title>
      <g:description>${escapeXml(itemDescription)}</g:description>
      <g:link>${escapeXml(productLink)}</g:link>
      <g:image_link>${escapeXml(imageLink)}</g:image_link>
      <g:availability>in_stock</g:availability>
      <g:price>${escapeXml(basePriceFormatted)}</g:price>${salePriceXml}${variantXml}
      <g:fb_product_category>${escapeXml(taxonomy.metaCategoryName)}</g:fb_product_category>
      <g:google_product_category>${taxonomy.googleCategoryId}</g:google_product_category>
      <g:product_type>${escapeXml(taxonomy.productType)}</g:product_type>
      <g:brand>${escapeXml(siteTitle)}</g:brand>
      <g:condition>new</g:condition>
    </item>`;
    });
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escapeXml(siteTitle)} - Meta Commerce Catalog</title>
    <link>${escapeXml(origin)}</link>
    <description>${escapeXml(siteDescription)}</description>${itemsXml}
  </channel>
</rss>`;
}
