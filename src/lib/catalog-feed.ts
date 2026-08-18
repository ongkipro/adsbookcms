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
 * AdsBookCMS uses one catalog item per product. The immutable D1 Product ID is
 * generated as a five-digit number, so product_id, content_id and feed <g:id>
 * are the same value. Variants remain checkout choices and do not create
 * separate catalog identities.
 *
 * - **Stable forever.** Google: "Once you've assigned an ID to a product, don't
 *   change it", and never reuse it, even for a deleted product. That rules out
 *   SKU as the basis, despite both platforms recommending it — `sku` here is
 *   nullable and merchant-editable, so it is exactly the thing that changes.
 *   Product IDs are allocated once and never edited.
 * - **Unambiguous in transit.** Decimal, no leading zero, minimum five digits.
 *   Legacy short IDs fail closed instead of being padded into a value that is
 *   no longer the real Product ID.
 */

/** Canonical ads identity: the immutable numeric D1 Product ID. */
export function catalogProductId(productId: number | string): string {
  const value = String(productId).trim();
  if (!/^[1-9]\d{4,15}$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new RangeError("Product ID katalog harus berupa angka minimal 5 digit.");
  }
  return value;
}

/**
 * The content id for a page where no variant has been chosen yet — a product
 * detail page or a landing page. The feed is product-level, while the first
 * variant remains the default price shown by the storefront.
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
  return catalogProductId(product.productId);
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

    const variant = product.variants[0];
    const itemId = catalogProductId(product.productId);
    // Omitted when no taxonomy rule was confident. Both platforms treat the
    // category as optional; a wrong one can cause feed disapproval.
    const googleCategoryXml = taxonomy.googleCategoryId
      ? `\n      <g:google_product_category>${taxonomy.googleCategoryId}</g:google_product_category>`
      : "";
    const titleText = product.productName;
    const hasSale = typeof variant.comparePrice === "number" && variant.comparePrice > variant.price;
    const basePriceFormatted = `${hasSale ? variant.comparePrice : variant.price} IDR`;
    const salePriceXml = hasSale
      ? `\n      <g:sale_price>${escapeXml(`${variant.price} IDR`)}</g:sale_price>`
      : "";
    const itemDescription = product.seoDescription || product.headline || product.description || siteDescription;

    itemsXml += `
    <item>
      <g:id>${escapeXml(itemId)}</g:id>
      <g:title>${escapeXml(titleText)}</g:title>
      <g:description>${escapeXml(itemDescription)}</g:description>
      <g:link>${escapeXml(productLink)}</g:link>
      <g:image_link>${escapeXml(imageLink)}</g:image_link>
      <g:availability>in_stock</g:availability>
      <g:price>${escapeXml(basePriceFormatted)}</g:price>${salePriceXml}
${googleCategoryXml}
      <g:product_type>${escapeXml(taxonomy.productType)}</g:product_type>
      <g:brand>${escapeXml(siteTitle)}</g:brand>
      <g:condition>new</g:condition>
      <g:identifier_exists>no</g:identifier_exists>${variant.sku ? `\n      <g:mpn>${escapeXml(variant.sku)}</g:mpn>` : ""}
    </item>`;
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

    const variant = product.variants[0];
    const itemId = catalogProductId(product.productId);
    const googleCategoryXml = taxonomy.googleCategoryId
      ? `\n      <g:google_product_category>${taxonomy.googleCategoryId}</g:google_product_category>`
      : "";
    const metaCategoryXml = taxonomy.metaCategoryName
      ? `\n      <g:fb_product_category>${escapeXml(taxonomy.metaCategoryName)}</g:fb_product_category>`
      : "";
    const titleText = product.productName;
    const hasSale = typeof variant.comparePrice === "number" && variant.comparePrice > variant.price;
    const basePriceFormatted = `${hasSale ? variant.comparePrice : variant.price} IDR`;
    const salePriceXml = hasSale
      ? `\n      <g:sale_price>${escapeXml(`${variant.price} IDR`)}</g:sale_price>`
      : "";
    const itemDescription = product.seoDescription || product.headline || product.description || siteDescription;

    itemsXml += `
    <item>
      <g:id>${escapeXml(itemId)}</g:id>
      <g:title>${escapeXml(titleText)}</g:title>
      <g:description>${escapeXml(itemDescription)}</g:description>
      <g:link>${escapeXml(productLink)}</g:link>
      <g:image_link>${escapeXml(imageLink)}</g:image_link>
      <g:availability>in_stock</g:availability>
      <g:price>${escapeXml(basePriceFormatted)}</g:price>${salePriceXml}
${metaCategoryXml}${googleCategoryXml}
      <g:product_type>${escapeXml(taxonomy.productType)}</g:product_type>
      <g:brand>${escapeXml(siteTitle)}</g:brand>
      <g:condition>new</g:condition>
    </item>`;
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
