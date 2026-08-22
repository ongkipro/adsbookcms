# Building a landing page

> Verified against disk: 2026-08-22 @ `d6f08c6` + A21

There are two kinds of landing page in this CMS and they are not
interchangeable. Pick the right one before writing anything.

| | CMS landing page | Native Astro landing page |
| --- | --- | --- |
| Author | an operator, in `/admin/landing-pages` | a developer or an AI terminal, in the repo |
| Lives in | D1, table `landing_pages` | `src/pages/<slug>.astro` |
| Served by | the `[slug].astro` catch-all | its own route |
| Changes need | nothing — saved and live | a build and a deploy |
| Use it when | the operator owns the copy and wants to iterate | the page needs layout or logic the builder cannot express |

## The URL contract

**Every landing page answers at `domain.com/<slug>`. There is no prefix** — no
`/landing`, no `/pages`, no `/lp`. That is the address an ad points at and the
address that gets shared.

Astro resolves a static route before a dynamic one, so a native page at
`src/pages/promo-lebaran.astro` answers `/promo-lebaran` and the
`[slug].astro` catch-all never sees it. The catch-all then owns every remaining
single-segment path: it resolves a CMS landing page, then a product redirect,
then falls through to 404.

**The collision this creates is real and silent.** If a native route and a CMS
landing page claim the same slug, the native file wins and the operator's page
becomes unreachable with no warning anywhere. Before adding a native route,
check `/admin/landing-pages` for that slug. This is the price of dropping the
prefix, and it is worth stating rather than discovering.

### The one exception: a landing page that *is* the product page

A landing page can take over its product's page (A21). When it does:

- `/produk/<product-slug>` renders the landing page, and that is its canonical
  address;
- its own `/<landing-slug>` answers `308` to the product URL, so exactly one
  URL is live and the two never compete as duplicate content;
- unpublishing it, or releasing the claim, hands `/produk/<product-slug>` back
  to the normal product template — the product never 404s because a landing
  page went away.

Only one landing page may hold a given product's page; the database enforces it
with a partial unique index rather than trusting the admin to remember. Set it
from the landing page list: **⋯ → Jadikan halaman produk**.

The hand-off is a rewrite carrying an `x-adsbook-product-page` header. Do not
reintroduce a check on `Astro.url` there: a rewrite does not carry the original
path, so the landing route sees its own slug either way, and reading the URL
sent the two routes into an endless redirect loop.

---

## Native Astro landing page — the flow

### 1. Decide the slug and the product

A landing page sells one product. Get its slug from `/admin/products` or from
`/produk`. Everything downstream — the form, the tracking payload, the catalog
identity — keys off that product.

### 2. Create the route

`src/pages/<slug>.astro` — at the root of `pages/`, so it answers
`domain.com/<slug>`. It must:

- render through `BaseLayout` so it inherits the header, footer, the 480 px
  column, tracking and the SEO chrome;
- resolve the product server-side and 404 through the shared page rather than a
  bare response:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import MetaLandingTracker from '../components/storefront/tracking/MetaLandingTracker.astro';
import GeoIpResolvedForm from '../components/storefront/forms/GeoIpResolvedForm.astro';
import { getStorefrontProduct } from '../lib/catalog';
import { catalogProductId } from '../lib/catalog-feed';
import '../styles/landing-pages/landing.css';

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
- `src/styles/landing-pages/landing.css` is the shared landing surface: the
  `.lp-section` rhythm, the type contract inside the column, and safe defaults
  for whatever an operator pastes (images, tables, blockquotes). Import it and
  build on it.
- Route-specific CSS goes in `src/styles/landing-pages/<slug>.css` and is
  imported **only** by that route. Never add landing rules to `foundation.css`
  (it ships to the admin too) or to `admin.css`.
- The column is 480 px and `BaseLayout` already owns it. Do not set another
  `max-width` on the page; style what goes *inside* the column.
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

---

## Listing a native page in the CMS — the contract, not yet the code

**Status: not implemented.** `/admin/landing-pages` lists what is in D1 plus the
hand-authored static entries in `src/data/`. A native route you add today
answers on its URL but does **not** appear in that list, and the operator has no
way to see it exists. That gap is task **A-133**.

When it is built it must work this way, and a native page written before then
should already carry what the registry will read:

- **A typed source manifest, not filesystem discovery.** Cloudflare Workers
  bundles routes; it cannot enumerate `src/pages/` at runtime. The manifest is
  a checked-in TypeScript file that a native route registers itself in.
- **Each entry declares** its slug, its title, its product slug, its meta
  description, and whether it is active. The slug must match the filename, and
  the build fails on a duplicate or an incomplete entry rather than shipping a
  page the CMS misrepresents.
- **The list is read-only for native entries.** An operator can see one, open
  it, and copy its URL; they cannot edit or delete it, because the file is the
  source of truth and a deploy is the only way to change it. The existing
  static entries already behave this way — reuse that shape rather than
  inventing a second one.
- **Taking over a product page stays a database fact.** `is_product_page` lives
  on `landing_pages`, so a native page cannot claim `/produk/<slug>` until it
  has a row. Decide that deliberately when A-133 lands; do not quietly widen
  the claim to files.

Until then: a native landing page is a route and a URL. Tell the operator its
address, because the CMS will not.

---

## Start from the sample

`src/pages/contoh-landing.astro` is a complete working native landing page, with
its own `src/styles/landing-pages/contoh-landing.css`. It answers at
`/contoh-landing` on any install, because it binds to the store's **first
active product** rather than a hard-coded slug — this repository is cloned into
every store, so a named product would resolve on one and 404 on the rest.

Copy it, then make it yours:

1. `cp src/pages/contoh-landing.astro src/pages/<slug>.astro` and the stylesheet
   beside it.
2. Replace the `getStorefrontProducts` lookup with
   `getStorefrontProduct(Astro.locals, 'your-product-slug')`.
3. Rewrite the sections and the copy.
4. **Delete `contoh-landing.astro`** before the store goes live, or it stays a
   public URL.

It deliberately shows the conditional pattern: benefit, key-point and review
sections render only when the product actually has that content, so a sparse
product produces a shorter page instead of empty headings.

## Writing one with an AI — the short version

Give this file to the assistant. The parts it will get wrong unprompted:

1. **Slug at the root.** `src/pages/<slug>.astro`, no prefix directory. Check
   `/admin/landing-pages` first so it does not shadow an operator's page.
2. **The form follows the product, not the page.**
   `<GeoIpResolvedForm mode="hybrid" productSlug={product.slug} />` — the
   product is resolved server-side and everything downstream keys off it.
   Never hard-code prices, variants, or a product id in the markup.
3. **480 px, and `BaseLayout` already owns it.** Style inside the column.
4. **No React on the public surface.** A gallery is `scroll-snap`; a countdown
   is a `<script>` tag.
5. **Three weights, one ramp, one accent.** Anything else is invented.
6. **Verify by opening it at 390 px**, not by a green build. `npm run check`,
   `npm test`, `npm run build`, then look at the page and the console.
