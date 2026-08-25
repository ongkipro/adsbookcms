export type CmsVersionInfo = {
  version: string;
  channel: string;
  releaseTag: string;
  coreEngine: string;
  schemaVersion: number;
  lastUpdated: string;
};

export const CMS_VERSION: CmsVersionInfo = {
  version: "1.3.1",
  channel: "production",
  // Google Ads offline delivery adds migration 0048.
  releaseTag: "2026.08-google-offline",
  coreEngine: "Astro 7 SSR + Cloudflare Workers",
  schemaVersion: 49,
  lastUpdated: "2026-08-25",
};
