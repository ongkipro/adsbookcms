/**
 * Which host a request belongs on, decided before any store lookup.
 *
 * Two rules, both 301 and both keeping the path and query (UTM, fbclid):
 *
 * - `http:` goes to `https:` on the same host. Cloudflare's "Always Use HTTPS"
 *   is a zone setting, and a second domain attached to the same Worker
 *   (petanisawit.com, 2026-10-20) can be left without it. The Worker should
 *   not depend on that.
 * - A host listed in `PUBLIC_ALIAS_HOSTS` (comma separated, `www.` variants
 *   implied) goes to the canonical origin from `PUBLIC_SITE_URL`. That lets a
 *   store keep older domains that ads or links still point at, with one
 *   canonical address for search engines, cookies and the Pixel.
 *
 * `/api/` is never moved. A webhook or payment callback registered on an older
 * domain, or on http, must still land: most senders do not follow a redirect,
 * and a 301 turns a POST into a GET. Local hosts are never moved either.
 */
export function resolveHostRedirect(
  url: URL,
  siteUrl: string | undefined | null,
  aliasHosts: string | undefined | null,
): string | null {
  if (url.pathname.startsWith('/api/')) return null;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')) return null;

  let canonical: URL | null = null;
  try {
    canonical = siteUrl ? new URL(siteUrl) : null;
  } catch {
    canonical = null;
  }

  const aliases = new Set(
    String(aliasHosts ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
      .filter(Boolean)
      .flatMap((entry) => [entry.replace(/^www\./, ''), `www.${entry.replace(/^www\./, '')}`]),
  );
  if (canonical && aliases.has(host) && host !== canonical.hostname.toLowerCase()) {
    return `${canonical.origin}${url.pathname}${url.search}`;
  }
  if (url.protocol === 'http:') {
    return `https://${url.host}${url.pathname}${url.search}`;
  }
  return null;
}
