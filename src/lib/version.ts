export type CmsVersionInfo = {
  version: string;
  channel: string;
  releaseTag: string;
  coreEngine: string;
  schemaVersion: number;
  lastUpdated: string;
};

export const CMS_VERSION: CmsVersionInfo = {
  version: "1.2.0",
  channel: "production",
  releaseTag: "2026.08-hardened",
  coreEngine: "Astro 7 SSR + Cloudflare Workers",
  schemaVersion: 42,
  lastUpdated: "2026-08-18",
};
