/**
 * The identity normalisation both Meta legs must agree on.
 *
 * A Purchase reaches Meta twice — once from the browser Pixel and once from the
 * server Conversions API — and the two are deduplicated by `event_id`. The match
 * keys are not deduplicated: Meta hashes what it is given, so if the two legs
 * normalise a person differently they describe two different people, and a hash
 * always *looks* correct while matching nothing.
 *
 * Meta's own rules, verified against the customer information parameters
 * documentation on 2026-08-19:
 *
 *   em      trim, lowercase
 *   fn, ln  lowercase, no punctuation
 *   ct, st  lowercase, no punctuation, no spaces
 *   zp      lowercase, no spaces, no dash
 *   ph      digits in E.164, no separators
 *
 * This module exists so there is exactly one implementation to keep correct.
 * `MetaThanksTracker.astro` cannot import it — `define:vars` forces `is:inline`,
 * which is never bundled — so it carries a copy, and `meta-identity.test.ts`
 * fails if that copy drifts.
 */

/** Lowercase, strip everything that is not a letter or digit. */
export function normalizeMetaText(value?: string): string | undefined {
  const cleaned = value?.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return cleaned || undefined;
}

/**
 * Indonesian storefront input is `08xxx`; a Meta profile stores `628xxx`. Also
 * handles the `+62`/`0062` and bare `8xxx` forms a customer may type, because
 * the browser leg previously normalised only the leading zero and hashed the
 * rest verbatim — a guaranteed miss against the server leg.
 */
export function toE164Digits(value?: string): string | undefined {
  let digits = value?.replace(/\D/g, "") || "";
  if (!digits) return undefined;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("620")) digits = `62${digits.slice(3)}`;
  else if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : undefined;
}

/** Meta wants `fn` as the first name alone and `ln` as everything after it. */
export function metaNameParts(value?: string): {
  firstName?: string;
  lastName?: string;
} {
  const parts = value?.trim().split(/\s+/).filter(Boolean) ?? [];
  return {
    firstName: normalizeMetaText(parts[0]),
    lastName:
      parts.length > 1 ? normalizeMetaText(parts.slice(1).join("")) : undefined,
  };
}
