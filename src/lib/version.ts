export type CmsVersionInfo = {
  version: string;
  channel: string;
  releaseTag: string;
  coreEngine: string;
  schemaVersion: number;
  lastUpdated: string;
};

export const CMS_VERSION: CmsVersionInfo = {
  version: "1.5.1",
  channel: "production",
  // 1.5.1: browser Meta events ordered behind the single pixel init.
  // 1.5.0: migrations 0056-0061, GA4 ecommerce payload, variant id over SKU,
  // mobile order button, deploy builds before upload (BUILD-LOG 2026-10-11).
  releaseTag: "2026.10-meta-track-order",
  coreEngine: "Astro 7 SSR + Cloudflare Workers",
  schemaVersion: 62,
  lastUpdated: "2026-10-12",
};
