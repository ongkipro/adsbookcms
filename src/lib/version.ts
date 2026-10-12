export type CmsVersionInfo = {
  version: string;
  channel: string;
  releaseTag: string;
  coreEngine: string;
  schemaVersion: number;
  lastUpdated: string;
};

export const CMS_VERSION: CmsVersionInfo = {
  version: "1.5.4",
  channel: "production",
  // 1.5.4: a landing page's hero is its first screen, not its first section.
  // 1.5.3: the toast stays off a CMS landing page's first section (its hero).
  // 1.5.2: social-proof toast redesign, fleet:status (A-51), island-test race.
  // 1.5.1: browser Meta events ordered behind the single pixel init.
  // 1.5.0: migrations 0056-0061, GA4 ecommerce payload, variant id over SKU,
  // mobile order button, deploy builds before upload (BUILD-LOG 2026-10-11).
  releaseTag: "2026.10-fleet-status",
  coreEngine: "Astro 7 SSR + Cloudflare Workers",
  schemaVersion: 62,
  lastUpdated: "2026-10-12",
};
