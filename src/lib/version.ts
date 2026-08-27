export type CmsVersionInfo = {
  version: string;
  channel: string;
  releaseTag: string;
  coreEngine: string;
  schemaVersion: number;
  lastUpdated: string;
};

export const CMS_VERSION: CmsVersionInfo = {
  version: "1.3.5",
  channel: "production",
  // 0049: sessions and rate limits in D1 (ADR-021). 0050: AutoLaris callback evidence (A-164).
  releaseTag: "2026.08-admin-blank-hotfix",
  coreEngine: "Astro 7 SSR + Cloudflare Workers",
  schemaVersion: 51,
  lastUpdated: "2026-08-27",
};
