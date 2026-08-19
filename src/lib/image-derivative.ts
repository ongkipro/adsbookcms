/**
 * The catalogue card renders at 182 CSS px, which is 478 device pixels on the
 * phone Lighthouse emulates, while the product detail view renders at 480 CSS
 * px and genuinely wants the full upload. One file cannot serve both without
 * wasting most of its bytes on the card, so a card-sized derivative lives
 * beside the original as `<name>-sm.<ext>`.
 *
 * `/assets/[...key].ts` falls back to the original when the derivative is
 * absent, so calling this on an image that has none is safe — it costs the old
 * number of bytes rather than breaking the tile.
 */
export function cardImageSrc(url: string): string {
  const trimmed = url?.trim() ?? '';
  if (!trimmed.startsWith('/assets/uploads/')) return trimmed;
  if (/-sm\.[a-z0-9]+$/i.test(trimmed)) return trimmed;
  return trimmed.replace(/(\.[a-z0-9]+)$/i, '-sm$1');
}
