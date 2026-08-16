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

export function formatContentId(id: number | string): string {
  const str = String(id || "").trim();
  if (!str) return "10001";
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    if (num < 10000) {
      return String(10000 + num);
    }
    return str;
  }
  if (str.length < 5) {
    return str.padStart(5, "0");
  }
  return str;
}

export function formatCatalogItemId(
  productId: number | string,
  variantIndex: number,
  totalVariants: number,
): { itemId: string; itemGroupId?: string } {
  const pId = formatContentId(productId);
  if (totalVariants === 1 || variantIndex === 0) {
    return { itemId: pId };
  }

  return {
    itemId: `${pId}_v${variantIndex + 1}`,
    itemGroupId: pId,
  };
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

    product.variants.forEach((variant, index) => {
      const { itemId, itemGroupId } = formatCatalogItemId(product.productId, index, product.variants.length);
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
      <g:price>${escapeXml(basePriceFormatted)}</g:price>${salePriceXml}
      <g:google_product_category>${taxonomy.googleCategoryId}</g:google_product_category>
      <g:product_type>${escapeXml(taxonomy.productType)}</g:product_type>
      <g:brand>${escapeXml(siteTitle)}</g:brand>
      <g:condition>new</g:condition>
      <g:identifier_exists>no</g:identifier_exists>
      <g:mpn>${escapeXml(variant.sku || itemId)}</g:mpn>
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

    product.variants.forEach((variant, index) => {
      const { itemId, itemGroupId } = formatCatalogItemId(product.productId, index, product.variants.length);
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
      <g:price>${escapeXml(basePriceFormatted)}</g:price>${salePriceXml}
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
