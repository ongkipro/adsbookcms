/**
 * Serialise a value for embedding in an inline `<script type="application/json">`
 * rendered through Astro's `set:html`.
 *
 * `JSON.stringify` escapes JSON syntax but NOT `<`, so a string field containing
 * `</script>` would close the element and let whatever follows run as HTML — a
 * stored-XSS breakout. Escaping `<` as `<` keeps the payload inside the
 * script's raw-text boundary; it is still valid JSON and `JSON.parse` decodes it
 * back to the original character, so readers see the exact value.
 *
 * This is the same invariant the JSON-LD blocks already apply
 * (`JsonLdSchema.astro`, `produk/[slug].astro`); it belongs anywhere untrusted
 * data crosses an HTML raw-text boundary.
 */
export function jsonForScript(value: unknown): string {
  // `JSON.stringify(undefined)` is `undefined`, not a string. Astro's own
  // `stringifyForScript` guards the same way; a shared helper must not throw on
  // the next caller that passes an optional value. `null` keeps the element
  // parseable for a consumer doing `JSON.parse(el.textContent)`.
  return JSON.stringify(value)?.replace(/</g, "\\u003c") ?? "null";
}
