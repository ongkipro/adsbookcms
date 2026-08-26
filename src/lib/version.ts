export type CmsVersionInfo = {
  version: string;
  channel: string;
  releaseTag: string;
  coreEngine: string;
  schemaVersion: number;
  lastUpdated: string;
};

export const CMS_VERSION: CmsVersionInfo = {
  version: "1.3.2",
  channel: "production",
  // Admin sessions and rate-limit counters move to D1 in migration 0049 (ADR-021).
  releaseTag: "2026.08-kv-quota",
  coreEngine: "Astro 7 SSR + Cloudflare Workers",
  schemaVersion: 50,
  lastUpdated: "2026-08-27",
};
