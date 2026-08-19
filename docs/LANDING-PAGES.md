# Building a landing page

> Verified against disk: 2026-08-20 @ `b0af25b`

There are two kinds of landing page in this CMS and they are not
interchangeable. Pick the right one before writing anything.

| | CMS landing page | Native Astro landing page |
| --- | --- | --- |
| Author | an operator, in `/admin/landing-pages` | a developer or an AI terminal, in the repo |
| Lives in | D1, table `landing_pages` | `src/pages/landing/<slug>.astro` |
| Served by | the `[slug].astro` catch-all | its own route |
| Changes need | nothing — saved and live | a build and a deploy |
| Use it when | the operator owns the copy and wants to iterate | the page needs layout or logic the builder cannot express |

The catch-all owns every single-segment path — `/promo-lebaran` resolves as a
CMS landing page first, then as a product redirect, then falls through to the
404 page. A native route at `src/pages/landing/promo.astro` answers at
`/landing/promo` and never collides with it.

---

## Native Astro landing page — the flow

### 1. Decide the slug and the product

A landing page sells one product. Get its slug from `/admin/products` or from
`/produk`. Everything downstream — the form, the tracking payload, the catalog
identity — keys off that product.

### 2. Create the route

`src/pages/landing/<slug>.astro`. It must:

- render through `BaseLayout` so it inherits the header, footer, the 480 px
  column, tracking and the SEO chrome;
- resolve the product server-side and 404 through the shared page rather than a
  bare response:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import MetaLandingTracker from '../../components/storefront/tracking/MetaLandingTracker.astro';
import GeoIpResolvedForm from '../../components/storefront/forms/GeoIpResolvedForm.astro';
import { getStorefrontProduct } from '../../lib/catalog';
import { catalogProductId } from '../../lib/catalog-feed';

export const prerender = false;

const product = await getStorefrontProduct(Astro.locals, 'ganti-slug-produk');
if (!product) return Astro.rewrite('/404');
---

<BaseLayout
  title={`${product.productName} - ${Astro.locals.tenant.name}`}
  description={product.seoDescription}
  image={product.heroImage}
  hideHeader={false}
>
  <MetaLandingTracker
    slug="ganti-slug-produk"
    contentId={catalogProductId(product.productId)}
    contentName={product.productName}
    price={product.price}
  />

  <!-- sections here -->

  <GeoIpResolvedForm mode="hybrid" productSlug={product.slug} />
</BaseLayout>
```

`mode="hybrid"` is deliberate: the form decides between the short and the full
variant from the visitor's province, and an excluded province is forced to the
full form with COD disabled. Do not hard-code `middle` or `full` on a landing
page unless the offer genuinely requires it.

### 3. Put sections in components, not in the route

Static sections go in `src/components/storefront/landing-pages/` as `.astro`
files. Add a hydrated island only for real interaction — **there is no React on
the public surface** and a landing page is not the place to reintroduce it. A
gallery is `scroll-snap`; a countdown is a `<script>` tag.

### 4. Styles

- Reuse what exists first: the tokens in `src/styles/foundation.css`, the
  public rules in `storefront.css`, and the cva variants in `lib/ui-variants.ts`.
- Route-specific CSS goes in `src/styles/landing-pages/<slug>.css` and is
  imported **only** by that route. Never add landing rules to `foundation.css`
  (it ships to the admin too) or to `admin.css`.
- The type ramp is 10 · 11 · 12 · 13 · 14 · 15 · 16 · 18 · 20 · 24 · 28 px.
  Do not invent an intermediate size; the checkout stylesheet had fifteen and
  they were collapsed to seven for exactly this reason.
- **Weights are 400, 600 and 700 only.** Those are the three Inter faces that
  ship. `font-medium` renders identically to `font-normal`, and
  `font-extrabold` and `font-black` render identically to `font-bold` —
  measured, not assumed. Writing them is a lie in the source.
- One accent: `#C5A880`. One ink: `#111111`. One neutral family, warm
  (`#F8F7F4` surfaces on a `#f8f7f4` canvas, white reading column).

### 5. Verify before calling it done

```bash
npm run check     # astro check + tsc
npm test
npm run build
```

Then open it. A green build is not evidence a page renders — an unterminated
frontmatter block once shipped a live 404 while every static check passed.
Check at 390 CSS px:

- no horizontal scroll;
- the form reaches a shipping quote for a real district;
- zero console errors;
- the page is in `sitemap.xml` if it should be indexed, and carries a canonical.

---

## CMS landing page

Nothing to build. `/admin/landing-pages` composes ordered `html` and `form`
sections, previews them in a 480 px canvas, and serves them through the
catch-all. `?preview=1` renders an inactive page for an authenticated admin and
sends `Cache-Control: no-store`.

Reach for a native route only when the builder genuinely cannot express the
layout. A page an operator can edit without a deploy is worth more than a page
that is slightly prettier.
