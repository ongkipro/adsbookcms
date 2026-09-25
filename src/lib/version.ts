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
  // 1.4.0: stock stops gating a sale (ADR-023). The working tree has since added
  // 0056-0058; bump releaseTag with the next release (RELEASE.md §4).
  releaseTag: "2026.08-stock-unlimited",
  coreEngine: "Astro 7 SSR + Cloudflare Workers",
  schemaVersion: 59,
  lastUpdated: "2026-09-25",
};
