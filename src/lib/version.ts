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
  // Still the landing release train: 1.3.1 is a patch on it, and no migration
  // was added, so `schemaVersion` stays at the 48 files on disk.
  releaseTag: "2026.08-landing",
  coreEngine: "Astro 7 SSR + Cloudflare Workers",
  schemaVersion: 48,
  lastUpdated: "2026-08-23",
};
