import {
  nativeLandingPages,
  type NativeLandingPage,
} from "../data/native-landing-pages.ts";

export type { NativeLandingPage };

export const NATIVE_LANDING_ID_PREFIX = "native:";

/** The slug rule the CMS already enforces, applied to the register too. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type NativeLandingRegisterError = {
  slug: string;
  reason: string;
};

/**
 * Rejects a register that would misrepresent the site.
 *
 * A duplicate slug means two files claim one URL and only one can answer; a
 * malformed slug cannot match a route filename; a missing product means the
 * CMS would list a page it cannot link to a product. Each is a build-time
 * mistake, and each is silent at runtime if it is not checked here.
 */
export function validateNativeLandingPages(
  entries: readonly NativeLandingPage[] = nativeLandingPages,
): NativeLandingRegisterError[] {
  const errors: NativeLandingRegisterError[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const slug = String(entry?.slug || "").trim();
    if (!SLUG_PATTERN.test(slug)) {
      errors.push({
        slug: slug || "(kosong)",
        reason: "slug wajib huruf kecil, angka, dan tanda hubung.",
      });
      continue;
    }
    if (seen.has(slug)) {
      errors.push({ slug, reason: "slug terdaftar lebih dari sekali." });
      continue;
    }
    seen.add(slug);

    if (!String(entry.title || "").trim()) {
      errors.push({ slug, reason: "title wajib diisi." });
    }
    if (!String(entry.productSlug || "").trim()) {
      errors.push({ slug, reason: "productSlug wajib diisi." });
    }
    if (!String(entry.description || "").trim()) {
      errors.push({ slug, reason: "description wajib diisi." });
    }
  }

  return errors;
}

export function activeNativeLandingPages(
  entries: readonly NativeLandingPage[] = nativeLandingPages,
): NativeLandingPage[] {
  return entries.filter((entry) => entry.isActive !== false);
}

export function nativeLandingIdFor(slug: string) {
  return `${NATIVE_LANDING_ID_PREFIX}${slug}`;
}

export function isNativeLandingId(id: string) {
  return id.startsWith(NATIVE_LANDING_ID_PREFIX);
}

/** In-memory, so the hot path can rule a request out without touching D1. */
export function isRegisteredNativeSlug(
  slug: string,
  entries: readonly NativeLandingPage[] = nativeLandingPages,
) {
  return activeNativeLandingPages(entries).some((entry) => entry.slug === slug);
}
