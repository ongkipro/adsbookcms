/**
 * Google Ads click identifiers.
 *
 * In a COD funnel the real conversion happens days later, when the courier
 * collects cash — long after the browser session is gone. Uploading that sale
 * back to Google as an offline conversion requires the click id captured at
 * landing, so without this the delivered revenue can never be attributed and
 * Smart Bidding only ever learns from unconfirmed form submissions.
 *
 * Captured server-side from the ad landing URL into a first-party cookie, read
 * back at checkout (cookies ride along with the submit request — no form
 * plumbing), and stored on the order for later upload.
 */

export const CLICK_ID_COOKIE = "adsbook_click_ids";

/**
 * Cookie name used before the AdsBookCMS rename. Read-only: an install upgraded
 * mid-campaign would otherwise drop up to 90 days of in-flight click ids that
 * can never be re-captured. Never written, so it ages out on its own.
 */
export const LEGACY_CLICK_ID_COOKIE = "zanoby_click_ids";

/** Click identifiers and attribution tags across Google, Meta, TikTok, and UTMs. */
export const CLICK_ID_KEYS = [
  "gclid",
  "gbraid",
  "wbraid",
  "_fbp",
  "_fbc",
  "fbclid",
  "ttclid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;
export type ClickIdKey = (typeof CLICK_ID_KEYS)[number];
export type ClickIds = Partial<Record<ClickIdKey, string>>;

// Click ids and tracking tokens are URL-safe strings up to 256 chars.
const CLICK_ID_PATTERN = /^[A-Za-z0-9._-]{1,256}$/;

export function parseClickIdsFromUrl(url: URL): ClickIds {
  const found: ClickIds = {};
  for (const key of CLICK_ID_KEYS) {
    const value = url.searchParams.get(key)?.trim();
    if (value && CLICK_ID_PATTERN.test(value)) found[key] = value;
  }
  if (found.fbclid && !found._fbc) {
    found._fbc = `fb.1.${Date.now()}.${found.fbclid}`;
  }
  return found;
}

export function serializeClickIds(ids: ClickIds): string {
  return JSON.stringify(ids);
}

/**
 * Tolerates anything: a missing cookie, truncated JSON, or a hand-edited value
 * yields an empty result rather than throwing inside the order path.
 */
export function parseClickIds(raw: string | null | undefined): ClickIds {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const found: ClickIds = {};
    for (const key of CLICK_ID_KEYS) {
      const value = parsed?.[key];
      if (typeof value === "string" && CLICK_ID_PATTERN.test(value)) {
        found[key] = value;
      }
    }
    return found;
  } catch {
    return {};
  }
}

export function readClickIdCookie(request: Request): ClickIds {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return {};
  const match =
    cookieHeader.match(new RegExp(`(?:^|;\\s*)${CLICK_ID_COOKIE}=([^;]+)`)) ||
    cookieHeader.match(new RegExp(`(?:^|;\\s*)${LEGACY_CLICK_ID_COOKIE}=([^;]+)`));
  if (!match) return {};
  try {
    return parseClickIds(decodeURIComponent(match[1]));
  } catch {
    return {};
  }
}

export function hasClickId(ids: ClickIds): boolean {
  return CLICK_ID_KEYS.some((key) => Boolean(ids[key]));
}
