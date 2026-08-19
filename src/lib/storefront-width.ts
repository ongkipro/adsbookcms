/**
 * One answer to "how wide is the public page", for every part that has to agree.
 *
 * The width used to be re-derived in three places from the same store field.
 * `BaseLayout` accepted a `contentWidth` prop, but `Breadcrumb` and `PageIntro`
 * read `storefrontTemplate` themselves — so a page that overrode the shell got a
 * breadcrumb and an intro that disagreed with it. `produk/index.astro` and
 * `produk/[slug].astro` do exactly that: both force `compact`, so on a
 * `wide-catalog` store they rendered a 480 px shell wrapped around a `max-w-6xl`
 * breadcrumb.
 *
 * The class strings are literals here on purpose. Tailwind scans `src/lib`, so
 * writing them as template pieces would stop them being generated.
 */
export type ContentWidth = 'compact' | 'wide';

/** The outer panel in `BaseLayout`. Wide is unconstrained; the rails hold it. */
export const SHELL_WIDTH_CLASS: Record<ContentWidth, string> = {
  compact: 'max-w-[480px]',
  wide: 'max-w-none',
};

/** Every rail inside the shell — breadcrumb, page intro, legal body. */
export const RAIL_WIDTH_CLASS: Record<ContentWidth, string> = {
  compact: 'max-w-[480px]',
  wide: 'max-w-6xl lg:px-6',
};

/**
 * `override` wins when a page states a width; otherwise the store's template
 * decides. An unknown template resolves to `compact`, matching how
 * `tenant-contract` degrades rather than throwing.
 */
export function resolveContentWidth(
  storefrontTemplate?: string | null,
  override?: ContentWidth | null,
): ContentWidth {
  if (override === 'compact' || override === 'wide') return override;
  return storefrontTemplate === 'wide-catalog' ? 'wide' : 'compact';
}
