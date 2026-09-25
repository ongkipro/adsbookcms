import type { APIRoute } from "astro";
import { getStorefrontProducts } from "../lib/catalog";
import { listPublicLandingPages } from "../lib/landing-pages";

export const prerender = false;

/**
 * Generated on demand rather than at build time.
 *
 * `@astrojs/sitemap` only emits entries for prerendered pages, and every route
 * here is server-rendered, so it would have produced nothing. Reading the live
 * catalogue also keeps the sitemap correct as products are added or
 * deactivated in admin — a build-time file would go stale the same day.
 */

// `/kebijakan-cookie` and `/disclaimer` render `noindex`; submitting them here
// only earns "Submitted URL marked noindex" in Search Console.
const STATIC_PATHS = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/produk", priority: "0.9", changefreq: "daily" },
  { path: "/kontak", priority: "0.5", changefreq: "monthly" },
  { path: "/pengiriman", priority: "0.4", changefreq: "monthly" },
  { path: "/kebijakan-privasi", priority: "0.3", changefreq: "yearly" },
  { path: "/syarat-ketentuan", priority: "0.3", changefreq: "yearly" },
];

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const GET: APIRoute = async ({ locals }) => {
  const tenantConfig = locals.tenant;
  const origin = tenantConfig.siteUrl.replace(/\/$/, "");
  const lastmod = new Date().toISOString().slice(0, 10);

  // A catalogue read failure must not take the sitemap down with it; the static
  // routes are still worth serving.
  type DynamicEntry = { path: string; image?: string; title?: string };
  let productEntries: DynamicEntry[] = [];
  try {
    const products = await getStorefrontProducts(locals);
    productEntries = products.map((product) => ({
      path: `/produk/${product.slug}`,
      image: product.heroImage ? new URL(product.heroImage, origin).toString() : undefined,
      title: product.productName,
    }));
  } catch (error) {
    console.error("sitemap-products", error);
  }

  let landingEntries: DynamicEntry[] = [];
  try {
    // The read-only public listing: a sitemap hit (every crawler, hourly) must
    // not run the native-page reconcile writes `listLandingPages` performs.
    const pages = await listPublicLandingPages(locals);
    landingEntries = pages
      // A page that has taken over its product's page answers `308` on its own
      // slug, and the product URL is already listed above. Advertising the
      // redirecting address here would hand Google exactly the duplicate pair
      // the takeover exists to prevent.
      .filter((p) => !p.isProductPage)
      .map((p) => ({
        path: `/${p.slug}`,
      }));
  } catch (error) {
    console.error("sitemap-landing-pages", error);
  }

  const entryMap = new Map<string, DynamicEntry>();
  for (const entry of [...productEntries, ...landingEntries]) {
    if (!entryMap.has(entry.path)) {
      entryMap.set(entry.path, entry);
    }
  }
  const allDynamicEntries = Array.from(entryMap.values());

  const entries = [
    ...STATIC_PATHS.map(
      (entry) =>
        `  <url>\n    <loc>${escapeXml(origin + entry.path)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`,
    ),
    ...allDynamicEntries.map(
      (entry) => {
        const imgXml = entry.image
          ? `\n    <image:image>\n      <image:loc>${escapeXml(entry.image)}</image:loc>\n      <image:title>${escapeXml(entry.title || "")}</image:title>\n    </image:image>`
          : "";
        return `  <url>\n    <loc>${escapeXml(origin + entry.path)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>${imgXml}\n  </url>`;
      },
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries.join("\n")}\n</urlset>\n`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
