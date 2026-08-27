export type CmsVersionInfo = {
  version: string;
  channel: string;
  releaseTag: string;
  coreEngine: string;
  schemaVersion: number;
  lastUpdated: string;
};

export const CMS_VERSION: CmsVersionInfo = {
  version: "1.4.0",
  channel: "production",
  // Stock stops gating a sale (ADR-023). No migration: the column is retained, inert.
  releaseTag: "2026.08-stock-unlimited",
  coreEngine: "Astro 7 SSR + Cloudflare Workers",
  schemaVersion: 51,
  lastUpdated: "2026-08-27",
};
