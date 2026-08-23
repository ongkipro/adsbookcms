/**
 * Escape a plain-text value for interpolation into HTML text / RCDATA content.
 *
 * Needed because `astro-seo` renders the document title through
 * `<title set:html={updatedTitle} />` (`node_modules/astro-seo/src/SEO.astro`
 * line 151), and `set:html` bypasses Astro's automatic escaping. A
 * merchant-controlled product title containing
 * `</title><script>…</script>` therefore closed the RCDATA element and the
 * script executed — reproduced live on 2026-08-23 against a local install.
 *
 * Text content is the whole scope: `&` must be replaced first, then `<` and
 * `>`. Quotes are deliberately left alone. Attribute values (`og:title`,
 * `twitter:title`, `content=`) are rendered by Astro, which already escapes
 * them; escaping quotes here as well would double-encode every one of them.
 */
export function escapeHtmlText(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
