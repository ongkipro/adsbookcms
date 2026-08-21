# AdsBookCMS — Design System

> Verified against disk: 2026-08-20 @ `519c255`
>
> **The public palette is monochrome (ADR-019).** Colour tokens below that
> describe the retired gold accent are historical; `design-tokens.md` at the
> repository root is the current source.

This document describes the presentation layer **as it ships**, extracted from the code rather than from intent. Concrete values carry a file reference, and a line number where that line number is stable. Section 1.4 dropped its line numbers after they drifted through a refactor and left the document wrong about its own subject. Anything that could not be verified against the tree was left out — see `DECISIONS.md` ADR-010.

Scope note from `ARCHITECTURE.md`: the **admin shell is a canonical product surface** (every install gets the same operator UI), while **storefront presentation varies per install** via `PUBLIC_STOREFRONT_TEMPLATE`. The two therefore have separate, deliberately unrelated palettes. Do not unify them.

---

## 1. Colour

There is **no colour token layer for the storefront.** Storefront colour is hex literals written inline as Tailwind arbitrary values (`bg-[#F8F7F4]`) and as raw CSS in component `<style>` blocks. Only the shadcn/admin layer uses CSS custom properties.

### 1.1 Storefront palette (`compact-market`)

The shipped storefront is a champagne-on-ebony boutique palette. Counts are literal occurrences of the hex string under `src/`.

| Hex | Role | Uses | Representative definition |
| --- | --- | ---: | --- |
| `#111111` | Primary ink / ebony — body text, announcement bar, primary button fill | 128 | `src/components/storefront/shared/SiteHeader.astro:6` |
| `#C5A880` | Accent — champagne gold; hover, active, badges, focus outline | 49 | `src/components/storefront/shared/SiteHeader.astro:6` |
| `#E5E5E5` | Hairline border — the only border colour in storefront chrome | 64 | `src/components/storefront/shared/SiteHeader.astro:16` |
| `#F8F7F4` | Canvas — warm alabaster page background | 49 | `src/components/storefront/shared/SiteHeader.astro:16` |
| `#555555` | Secondary text | 22 | `src/components/storefront/shared/Breadcrumb.astro:21` |
| `#8A704F` | Muted gold — eyebrow labels, sub-brand text | 12 | `src/components/storefront/shared/SiteBrand.astro:37` |
| `#77736C` | Placeholder / tertiary text | 7 | `src/components/storefront/home/ProductsSection.astro:52` |
| `#D8D6D0` | Input and product-card border (heavier than `#E5E5E5`) | 6 | `src/components/storefront/home/ProductsSection.astro:52` |
| `#EEEAE2` | Hero image well background | 2 | `src/components/storefront/home/HeroSection.astro:40` |
| `#A3A09A` | Breadcrumb separator | 1 | `src/components/storefront/shared/Breadcrumb.astro:31` |
| `#999999` | Footer copyright | 1 | `src/components/storefront/shared/SiteFooter.astro:34` |

White (`#ffffff` / `bg-white`) is the card surface against the `#F8F7F4` canvas — e.g. `src/components/storefront/shared/ProductListItem.astro:31`, `src/components/storefront/home/ProofsSection.astro:68`.

The only place any of these are given a name is `src/lib/ui-variants.ts`:

- `buttonVariants` primary — `bg-[#111111] text-white hover:bg-[#C5A880] hover:text-[#111111]` (`src/lib/ui-variants.ts:8`)
- `badgeVariants` green — `bg-[#F8F7F4] text-[#8A704F] ring-1 ring-[#E5E5E5]` (`src/lib/ui-variants.ts:30`)
- `textVariants` — `brand: 'text-[#111111]'`, `accent: 'text-[#C5A880]'` (`src/lib/ui-variants.ts:79-80`)

Note the leak: the same file's `secondary`, `dark`, `ghost` button variants and every `listItemVariants` / `metaTextVariants` value are Tailwind **slate**, not the boutique palette (`src/lib/ui-variants.ts:9-11`, `46`, `60`, `72`). See §8.

### 1.2 Storefront palette (`wide-catalog`)

The second template does **not** use the boutique palette at all. It is Tailwind `zinc` plus `emerald` accents on a `#FBFBFB` canvas:

- Canvas `bg-[#FBFBFB]`, text `text-zinc-950` — `src/components/storefront/templates/WideCatalogHome.astro:29`
- Hero accent dot `bg-emerald-400` — `:36`
- Category eyebrow `text-emerald-700` — `:78`

`#FBFBFB` appears only in this file (2 uses).

### 1.3 Admin palette (canonical product surface)

Admin colour **is** tokenised. `.admin-shell` redefines the shadcn variables in oklch:

- Token block — `src/styles/admin.css`
- Accent is a single JS constant: `export const ADMIN_ACCENT = "#2563eb"`, injected as `--admin-accent` inline on `<body>` and consumed by `src/styles/admin.css` for primary, focus, and input states.
- Shell background and table chrome are scoped in `src/styles/admin.css`, matched by `bg-[#f6f7f9]` on the body class (`src/layouts/AdminLayout.astro`).
- Admin login is a plain colour stage owned by the product. Its only image is the runtime store/product identity mark inside the form card; it carries no decorative or merchant-specific background imagery (LOGIN-18).

### 1.4 Base shadcn tokens

The `:root` oklch scale and its `.dark` overrides live in `src/styles/admin.css`,
which is the only entry that imports shadcn. `--primary: oklch(0.546 0.245 262.881)`
is a blue matching `ADMIN_ACCENT`; `.admin-shell` raises `--radius` from `0.625rem`
to `0.75rem`.

The radius scale itself is **shared**, declared in `src/styles/foundation.css`.
It reached every surface through shadcn's theme block until the three-way split;
leaving it behind in `admin.css` silently reshaped every rounded corner on the
storefront, because `rounded-md` fell back to Tailwind's `0.375rem`. `admin.css`
also declares `--radius: 0.625rem` for shadcn's own `:root` block, and the two
agree deliberately. Giving the storefront its own radius is a design decision,
not something to arrive at by moving a file.

The base variable set — `--bg-canvas: #fafafa`, `--text-main: #0f172a`,
`--focus-ring: #2563eb` — is also in `foundation.css`. `--focus-ring` is live;
`--bg-canvas` sets `body`, but every storefront template paints over it.

Line numbers are deliberately absent here. This section cited them, they drifted
with the split, and the document was wrong about its own subject.

---

## 2. Typography

### 2.1 Families and imported weights

| Family | Weights imported | Import site | Applied where |
| --- | --- | --- | --- |
| Inter | 400, 600, 700 | `src/styles/foundation.css` | shared `body` and admin shell |
| Cinzel | 700 | `src/styles/foundation.css` | brand type only, via inline `style` |

Font faces are owned by `foundation.css`, which all three surface entries import.
They were in `BaseLayout` once, so the 26 admin routes asked for a family whose
faces were declared nowhere they could see and rendered in `system-ui`; the
foundation exists so that cannot recur. Plus Jakarta Sans is no longer imported;
`EmbedLayout` intentionally inherits Inter.

Cinzel is applied through three inline `style` attributes, not a class or token:

- `src/components/storefront/shared/SiteBrand.astro:23` — `font-family: 'Cinzel', serif`
- `src/components/storefront/shared/SiteBrand.astro:30` — `font-family: 'Cinzel', 'Playfair Display', Georgia, serif`
- `src/components/storefront/home/ProofsSection.astro:74`
- `src/pages/produk/[slug].astro:394`

`AdminLayout.astro` imports no font files at all; admin inherits Inter from `foundation.css`.

### 2.2 Stack

```css
'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif
```
`src/layouts/BaseLayout.astro` and the `body` rule in `src/styles/foundation.css`. The admin variant adds `"Segoe UI"` and enables `font-feature-settings: "cv02","cv03","cv04","cv11"` in `src/styles/admin.css`.

### 2.3 Storefront type treatment

The storefront voice is **small, uppercase, wide-tracked labels over large tight headlines**.

- Announcement bar: `text-[10px] font-medium tracking-widest uppercase` — `src/components/storefront/shared/SiteHeader.astro:6`
- Wordmark: `text-[15px] font-bold uppercase tracking-[0.2em]` — `src/components/storefront/shared/SiteBrand.astro:29`
- Section eyebrow: `text-[10px] font-semibold uppercase tracking-[0.15em]` — `src/components/storefront/home/ProductsSection.astro:38`
- Section heading: `text-[26px] font-semibold leading-tight tracking-[-0.035em]` — `src/components/storefront/home/ProductsSection.astro:41`
- Page `h1`: `text-[28px] font-extrabold leading-[1.18] tracking-[-0.02em]` — `src/components/storefront/shared/PageIntro.astro:26`
- Footer links: `text-[10px] font-semibold tracking-widest uppercase` — `src/components/storefront/shared/SiteFooter.astro:23`

Mobile input font-size is force-set to `1rem` to stop iOS zoom — `src/styles/foundation.css` (all viewports ≤639px, shared because every surface has inputs) and again for admin at ≤1023px (`src/layouts/AdminLayout.astro:66-73`).

---

## 3. Shape language

**Rule: the `compact-market` storefront is square. Use `rounded-none` with a 1px hairline border. Do not reach for a default rounded card.**

This is verified, not aspirational: `rounded-none` appears **46 times** under `src/`, and it is written *explicitly* even where it is the CSS default, because the surrounding shadcn/Tailwind habit is to round. Within storefront scope (`components/home`, `components/shared`, `components/storefront`, `pages/produk`) the ratio is `rounded-none` 20 : `rounded-xl` 4 : `rounded-2xl` 2 : `rounded-sm` 1 : `rounded-lg` 1 : `rounded-3xl` 1. (`rounded-full` 15 is legitimate — dots, pills, ping indicators.)

Load-bearing examples:

| Surface | Reference |
| --- | --- |
| Product card | `src/components/storefront/shared/ProductListItem.astro:31` — `rounded-none border border-[#E5E5E5] bg-white` |
| Product card image | `src/components/storefront/shared/ProductListItem.astro:42` |
| Discount badge | `src/components/storefront/shared/ProductListItem.astro:47` |
| Catalog search input | `src/components/storefront/home/ProductsSection.astro:52` — `min-h-12 … rounded-none border border-[#D8D6D0]` |
| Home product card | `src/components/storefront/home/ProductsSection.astro:78` |
| Primary CTA | `src/components/storefront/home/ProductsSection.astro:164` |
| Proof card | `src/components/storefront/home/ProofsSection.astro:68` |
| PDP gallery frame + thumbs | `src/components/storefront/ProductImageGallery.astro` |
| Load-more button | `src/pages/produk/index.astro:49` |
| Payment page (19 occurrences) | `src/pages/payment.astro:17` onward |
| Thanks page | `src/pages/thanks.astro:43`, `:131` |

Borders carry the structure that radius and shadow would normally carry. Shadow is nearly absent from the storefront — `shadow-2xs` / `shadow-xs` only (`ProofsSection.astro:68`, `payment.astro:82`). The one real shadow is the compact-shell drop: `shadow-[0_0_40px_rgba(15,23,42,0.08)]` (`src/layouts/BaseLayout.astro:187`).

**Exceptions that exist and are not errors:** the `wide-catalog` template is deliberately round (`rounded-full` CTAs at `WideCatalogHome.astro:51,57`, `rounded-2xl` hero image at `:70`), the admin shell is round (`0.875rem` cards, `src/styles/admin.css`), and `form-hybrid.css` predates the square rule (§4).

---

## 4. Form controls (checkout)

Checkout is the highest-traffic surface. It is styled in **one route-owned layer**.

**One layer: `src/styles/form-hybrid.css`.** It is imported by the seven routes that render a checkout — `/hybrid-form`, `/middle-form`, `/full-form`, `/geoipform`, `/embed/form`, `/produk/[slug]` and `/[slug]` — and by nothing else, so no admin page carries it.

Until 2026-08-16 there was a second layer: 110 lines of `:global([data-canonical-order-form])` in `GeoIpResolvedForm.astro` that repainted layer 1 into the shipped palette. It could only ever reach six of the seven routes, because `/hybrid-form` renders the content components directly and never sets that attribute — which is why one checkout surface stayed green and orange while the rest were ebony and champagne. Layer 1 now *is* the palette and the override is deleted. The `data-canonical-order-form` attribute remains in the DOM but styles nothing.

### 4.1 Input geometry — `form-hybrid.css:270-288`

```
width: 100%
min-height: 2.9rem
padding: 0.96rem 0.75rem 0.2rem     /* top-heavy: reserves room for the floated label */
border: 1px solid #d8ddd6
border-radius: 0.5rem
background: #f7f8f7
color: #0f172a
font-size: 1rem
font-weight: 500
line-height: 1.35
box-shadow: none
```

Textarea overrides — `min-height: 4.4rem`, `padding-top: 1.25rem`, `padding-bottom: 0.38rem`, `resize: vertical` (`:289-294`).

Shipped values: `border-color: #E5E5E5; background: #ffffff; color: #111111` (`form-hybrid.css`).

### 4.2 Floating label

The float is pure CSS, driven by `:placeholder-shown`. Placeholders are made transparent so the label can occupy the field (`form-hybrid.css:295-298`).

**Resting** — `form-hybrid.css:299-316`:
```
position: absolute; left: 0.75rem; top: 1rem
color: #667085
font-size: 0.78rem; font-weight: 500; line-height: 1
transform-origin: left top; pointer-events: none
```
Textarea resting top is `0.85rem` (`:317-320`).

**Floated** (`:focus` or `:not(:placeholder-shown)`) — `form-hybrid.css:321-333`:
```
top: 0.3rem
color: #245e28
font-size: 0.62rem; font-weight: 700
```
The focused label is `#111111` (`form-hybrid.css`).

**Invalid label** — `color: #b42318` (`form-hybrid.css:347-350`).

### 4.3 Field states

| State | Rule | Reference |
| --- | --- | --- |
| Focus | `border-color: #111111; background: #ffffff` | `form-hybrid.css` |
| Focus | `border-color: #111111 !important; box-shadow: 0 0 0 2px rgba(197,168,128,.3)` | `form-hybrid.css` |
| Valid `.field-valid` | `border-color: #8bc58f; background: #ffffff !important; box-shadow: none` | `form-hybrid.css:396-403` |
| Valid | `border-color: #C5A880; background: #F8F7F4 !important` | `form-hybrid.css` |
| Invalid `.field-invalid` | `border-color: #dc2626 !important; background: #fffafa !important; box-shadow: 0 0 0 2px rgba(220,38,38,.08)` | `form-hybrid.css:388-395` |
| Error message `.field-feedback` | `0.72rem / 600`, `color: #d92d20`, `!` glyph in a `#fee4e2` circle, `fieldFeedbackIn` 0.18s | `form-hybrid.css:358-384` |

### 4.4 Variant cards

Two variants exist and they are not the same shape.

`.variant-copy` — `form-hybrid.css:133-140`:
```
display: flex; gap: 0.65rem
padding: 0.65rem 0.85rem
border: 1px solid #e6eae2
background: #fff
/* no border-radius */
```

`.simple-variant-copy` — `form-hybrid.css:141-147`:
```
padding: 0.72rem 0.85rem
border: 1px solid #dfe5dc
border-radius: 0.7rem
background: #f6f7f5
box-shadow: none
```

Group gap: `.variant-group` is `0.2rem` (`:117-122`); `.simple-variant-group` is `0.5rem` (`:123-125`).

Radio dot `.variant-radio`: `1.1rem` square, `border: 2px solid #cbd5e1`, `margin-top: 0.12rem` (`:148-155`).

Checked state: `border-color: #111111; background: #F8F7F4` (`:172-177`), and the radio fills with a radial gradient in the same ink. There is no longer a second declaration competing with it.

Typography: `.variant-label` `0.82rem / 800 / #0f172a` (`:224-230`); `.variant-price` `0.95rem / 800 / #111111` (`:237-242`); `.variant-compare` `0.72rem / #94a3b8` line-through (`:243-247`).

### 4.5 District autocomplete

`.district-list` — `form-hybrid.css:509-522`: `margin-top: 0.35rem`, `max-height: 16rem`, `overflow-y: auto`, `border: 1px solid #cbd5e1`, `border-radius: 0.6rem`, `box-shadow: 0 10px 25px -5px rgba(0,0,0,.1), 0 8px 10px -6px rgba(0,0,0,.04)`, entrance animation `districtDropdownIn` 0.15s (`:499-508`, `:523-525`).

`.district-item` — `:533-553`: `padding: 0.55rem 0.85rem`, `border-left: 3px solid transparent`, `border-bottom: 1px solid #f1f5f9`. Hover/focus is **already boutique in layer 1**: `background: #F8F7F4; border-left-color: #C5A880` (`:587-592`). Item type: `strong` `0.82rem / 700 / #0f172a` (`:568-577`), `small` `0.68rem / 500 / #64748b` (`:578-586`).

Picked-address card `.shipping-address-summary` — `:442-448`: `padding: 0.75rem`, `border: 1px solid #c7ddc4`, `border-radius: 0.65rem`, `background: #f7fbf5`.

### 4.6 Summary and total

`.summary-card` — `form-hybrid.css:818-826`: `border: 1px solid #dfe5dc`, `border-radius: 0.75rem`, `background: #fff`, `box-shadow: 0 1px 2px rgba(15,23,42,.04)`, `overflow: hidden`.

Rows — `:827-848`: `padding: 0.62rem 0.85rem`, `border-bottom: 1px solid #f1f5f9`; label `0.78rem / 600 / #64748b`, value `0.82rem / 700 / #0f172a` right-aligned.

`.total-box` — `:894-898`: `padding: 0.85rem`, `border-top: 1px solid #E5E5E5`, `background: #F8F7F4`, flex space-between. The green tints it carried (`#d7e7d8` on `#f3f8f2`) were never overridden by the deleted layer, so they shipped on all seven checkout routes until 2026-08-16.

### 4.7 Submit button

Layer 1 `.submit-main` — `form-hybrid.css`: full width, `min-height: 2.75rem`, square, `background: #111111`. States `ready` / `disabled` (`#e5e5e5` fill, `#555` text) / `loading` are driven by `data-state`. There is no orange anywhere in the build: `f97316` and `ea580c` appear zero times under `dist/`.

The submit button is `background: #111111 !important; color: #ffffff !important` (`:949-950`), with `border-color: #C5A880` on hover (`:964`). It carries its own `:focus-visible` indicator — that used to live only in the deleted override, so `/hybrid-form` had no keyboard focus ring at all.

---

## 5. Layout widths

The storefront ships two compiled templates, enumerated in `src/lib/tenant-contract.ts`. The active template resolves at request time from the store row with environment/default fallback. An unknown value logs and degrades to `compact-market`; it does not throw.

**The width branch happens in three places, and all three must agree:**

1. `src/layouts/BaseLayout.astro:53` — `contentWidth` defaults to `wide` when the template is `wide-catalog`, else `compact`.
2. `src/layouts/BaseLayout.astro:184-189` — the shell:
   - `compact` → `max-w-[480px] shadow-[0_0_40px_rgba(15,23,42,0.08)]`
   - `wide` → `max-w-none`
   Both sit inside `flex min-h-screen w-full justify-center` (`:182`) on a `bg-white` panel (`:185`).
3. `src/components/storefront/shared/Breadcrumb.astro:20` — reads `Astro.locals.tenant.storefrontTemplate` **directly** rather than taking a prop: `max-w-6xl lg:px-6` for wide, `max-w-[480px]` for compact.

Because Breadcrumb re-derives the branch instead of inheriting it, a page that passes an explicit `contentWidth` diverges from its own breadcrumb. Two pages do exactly that: `src/pages/produk/index.astro:16` and `src/pages/produk/[slug].astro:111` both hard-code `contentWidth="compact"`.

Inner content repeats `max-w-[480px]` independently rather than inheriting the shell — `CompactMarketHome.astro:45`, `SiteHeader.astro:17`, `SiteFooter.astro:14`, `produk/index.astro:30`, `PageIntro.astro:23`, `form-hybrid.css`, `EmbedLayout.astro:26`.

`WideCatalogHome.astro` uses `max-w-7xl px-5 md:px-10` (`:33`) and has no 480px constraint anywhere.

`EmbedLayout` is fixed at 480px with no template branch (`src/layouts/EmbedLayout.astro:26`).

`AdminLayout` is not width-constrained: `flex h-dvh overflow-hidden` on the body (`src/layouts/AdminLayout.astro:39`), with layout owned by `AdminShell` and the shadcn sidebar.

### 5.1 Admin navigation motion contract

Admin navigation is intentionally static. Desktop renders direct workspace links
and a compact, always-visible child list below the active workspace. The parent
remains a link to its overview; there is no accordion, disclosure state,
auto-scroll, width toggle, or clickable resize rail. Tablet hides the contextual
child list in its icon rail, while child destinations remain available from
their parent overview and global search. The phone all-menu sheet renders every
role-allowed child. Viewport width alone chooses the navigation mode: phone
bottom navigation, tablet icon rail, or full desktop sidebar
(`src/components/admin/AdminShell.tsx`, `src/components/admin/AppSidebar.tsx`).

The admin-scoped rule in `src/styles/admin.css` disables animation and
transition on the sidebar, tooltip, bottom navigation, and Sheet navigation
surfaces. This does not disable action feedback: loaders may still spin while a
real request is pending, and loading/error/empty states remain visible. GSAP is
not installed; `tw-animate-css` remains shared UI infrastructure rather than an
admin navigation dependency.

### 5.2 Admin dashboard hierarchy

The dashboard follows overview-first order: schema mismatch notice, universal
business analytics, then owner/admin operational health. Analytics owns the
period control, four KPIs, revenue trend, and payment mix. Diagnostics never
push the primary business overview below the fold before it.

Sidebar and mobile-menu labels use regular weight; only the current location is
medium. Dashboard headings and numeric values are semibold, while labels are
medium or regular. KPI values use tabular numerals and do not truncate. At phone
and tablet widths KPIs remain a 2×2 grid; from `lg` they form one row, and the
trend/payment split begins at `xl`. Dashboard links are rendered only when the
same route policy grants access to their destination.

---

## 6. Tailwind v4 setup

Tailwind is configured CSS-first. **There is no `tailwind.config.*` file** — `components.json:7` sets `"config": ""`.

### 6.1 Three surfaces, one foundation

The CMS admin, the public storefront and checkout are three separate style
surfaces. They share exactly one file.

| Entry | Imported by | Owns |
| --- | --- | --- |
| `src/styles/foundation.css` | the three entries below | Tailwind, the type ramp, base tokens, radius scale, reduced-motion, scrollbar, mobile input sizing |
| `src/styles/admin.css` | `AdminLayout`, `/hello` | shadcn, tw-animate, `.admin-shell`, `.btn-*`, `.admin-input-flat` |
| `src/styles/storefront.css` | `BaseLayout`, `EmbedLayout` | public-only rules |
| `src/styles/form-hybrid.css` | the checkout routes, directly | the entire checkout layer, standalone — no Tailwind, no `@apply` |

This replaced a `global.css` that carried Tailwind, shadcn and tw-animate
together and was imported by both the admin and the storefront entries. The
split was therefore nominal: measured on a local build, `/` inlined 176 KB of
CSS against `/admin/login`'s 184 KB, and the public CSS contained 69 occurrences
of `sidebar`, 16 shadcn `[data-slot=` selectors and the chart tokens. It is now
67.6 KB for `/`, 84.7 KB for `/full-form` and 158.4 KB for `/admin/login`.

**Each entry declares what it is built from.** `foundation.css` imports Tailwind
with `source(none)`, so nothing is discovered automatically, and every surface
lists its own `@source` roots. A utility a storefront page never writes is never
generated into the storefront bundle.

The consequence to remember: **class names written outside a template still have
to be declared.** `src/lib/ui-variants.ts` holds the cva variants both surfaces
render with, and leaving `../lib` out of the scan roots silently dropped `py-7`
from the product page. Both entries scan `../lib` for that reason.

### 6.2 Wiring

- Vite plugin — `astro.config.mjs` (`@tailwindcss/vite`).
- Import chain at the top of `foundation.css`:
  ```css
  @import "tailwindcss" source(none);
  @import "@fontsource/inter/400.css";
  @import "@fontsource/inter/600.css";
  @import "@fontsource/inter/700.css";
  @import "@fontsource/cinzel/700.css";
  @custom-variant dark (&:is(.dark *));
  ```
- `tw-animate-css` and `shadcn/tailwind.css` are imported by `admin.css` alone.
  No public file imports a shadcn component; a census found `.btn-primary` at 6
  admin references and 0 public, `.btn-blue` 8/0, `.btn-secondary` 11/0,
  `.admin-input-flat` 11/0.
- Token bridge — `@theme inline { … }` in `admin.css` maps every shadcn variable
  to a Tailwind colour utility. The **radius** half of that bridge is in
  `foundation.css` because all three surfaces share it (§1.4).
- Values live in `:root` and `.dark` inside `admin.css`, in **oklch**, per
  Tailwind v4 / shadcn convention.

shadcn config (`components.json`): style `base-nova` (`:3`), `rsc: false` (`:4`), `tsx: true` (`:5`), `baseColor: neutral` (`:9`), `cssVariables: true` (`:10`), no prefix (`:11`), `iconLibrary: lucide` (`:13`), aliases `@/components`, `@/lib/utils`, `@/components/ui` (`:15-21`).

**`shadcn` is a runtime `dependency`, not a devDependency** (`package.json:47`). That is required, not a mistake: `admin.css` does `@import "shadcn/tailwind.css"`, so the package must resolve during `astro build`, not only during CLI scaffolding. `tw-animate-css` is in `dependencies` (`package.json:51`) for the same reason.

`cn()` is `twMerge(clsx(...))` — `src/lib/cn.ts:1-6`. `src/lib/utils.ts:1` is a one-line re-export so the shadcn `@/lib/utils` alias resolves; both names are live in the tree.

Class-variance-authority variants for storefront primitives live in `src/lib/ui-variants.ts` (button, badge, list-item, meta-text, text tone, plus two bare class constants at `:90-91`).

---

## 7. Component inventory

### 7.1 `src/components/ui/` — shadcn primitives

The directory contains 21 primitives used by admin React islands. The former zero-import primitives `input-group.tsx` and `popover.tsx` were removed by A-34. Treat this directory as shared admin infrastructure; extend an existing primitive before introducing another component system.

### 7.2 `src/components/storefront/shared/`

The nine current shared Astro components are `Breadcrumb.astro`, `Icon.astro`, `LegalPage.astro`, `PageIntro.astro`, `ProductListItem.astro`, `RatingStars.astro`, `SiteBrand.astro`, `SiteFooter.astro`, and `SiteHeader.astro`. The six orphan components previously listed here were removed by A-34.

### 7.3 Other storefront directories

- `src/components/storefront/home/` — `HeroSection.astro`, `ProductsSection.astro`, `ProofsSection.astro`. All three are consumed by `CompactMarketHome.astro:2-4` only.
- `src/components/storefront/` — `ProductImageGallery.astro` and `templates/`. **There is no React on the public surface.** The gallery was the only island; it shipped 183 KB of React runtime to drive 4 KB of component code, measured on a live install.
- `src/components/storefront/forms/` — `FormHybridContent.astro` (259 lines), `FormMiddleContent.astro` (218), `GeoIpResolvedForm.astro` (175).

### 7.4 PDP gallery layout

`ProductImageGallery.astro` is a left vertical thumbnail rail beside the main image, not a carousel with dots:

- Row container `flex flex-row gap-2.5 sm:gap-3`
- Thumb rail `w-14 shrink-0 flex-col overflow-y-auto max-h-[420px] sm:w-16 sm:max-h-[500px]`, rendered only when the gallery holds more than one photo
- Thumbs `aspect-[3/4] rounded-none`, active = `border-[#C5A880] ring-1 ring-[#C5A880]`, inactive = `border-[#E5E5E5] opacity-60`
- Main frame `flex-1 aspect-[3/4] rounded-none border border-[#E5E5E5] bg-[#F8F7F4]`, with the photos on a `snap-x snap-mandatory` track filling it through `absolute inset-0`

Swiping is the browser's, not ours — the track is a scroll container, so there
are no touch handlers. Arrows, the counter and the thumbnail highlight are the
only things that need script, and the script returns immediately when there is
one photo. `catalog-data.ts` currently builds exactly one image per product, so
that early return is the normal path; the rail exists for when real galleries
return.

### 7.5 Catalog pagination

`/produk` renders **every** product and hides the overflow with CSS, then reveals it with a load-more button. It does not slice.

- `const INITIAL_COUNT = 10` — `src/pages/produk/index.astro:10` (and again in the client script at `:66`)
- All products mapped; `index >= INITIAL_COUNT` gets `hidden` — `:35`
- Counter and "Muat Lebih Banyak" button, rendered only when `products.length > INITIAL_COUNT` — `:41-53`
- Reveal loop removes `hidden` — `:79`

---

## 8. Known inconsistencies

Current observations, not a second backlog. Any item selected for implementation must first receive its own requirement/task in the canonical ledgers.

**8.1 Two headless UI libraries ship side by side.** `radix-ui` and `@base-ui/react` are both runtime dependencies and current admin primitives import both. The former zero-import `popover.tsx` was removed; choosing whether to converge libraries requires a measured bundle/behaviour migration, not a speculative rewrite.

**8.2 Three parallel colour systems in the storefront.** Boutique hex literals (§1.1), Tailwind `slate` (`src/lib/ui-variants.ts:9-11`, `:46`, `:60`, `:72`, `:81-83`; `src/pages/thanks.astro:43,131`; `src/pages/payment.astro:17` onward), and Tailwind `emerald` (16 × `emerald-700`, 10 × `emerald-100`, 10 × `emerald-800` across `payment.astro`, `thanks.astro`, `WideCatalogHome.astro`). `/payment` and `/thanks` are customer-facing pages that adopted the square shape rule but never the boutique palette — they are slate + emerald with `#F8F7F4` used only as a fill (`payment.astro:27,58,68,106`).

**8.3 The literal `#047857` appears nowhere under `src/`** — 0 occurrences. Emerald reaches the page only through Tailwind utility classes, so any doc quoting that hex as the brand colour is describing a value the build never emits.

**8.4 — RESOLVED 2026-08-16.** The two checkouts diverged: `GeoIpResolvedForm.astro`'s `[data-canonical-order-form]` overrides were the boutique palette, while `/hybrid-form` bypassed that wrapper and rendered raw `form-hybrid.css` — green float labels, green focus ring, orange gradient submit. Resolved by deleting the override layer and folding the boutique palette into `form-hybrid.css` itself: `data-canonical-order-form` now appears in the build only as a DOM attribute, in zero CSS rules, and the seven checkout routes resolve to one palette.

**8.5 — RESOLVED 2026-08-16.** The checkout is styled by override, not by token. Layer 2 is 110 lines of `:global()` selectors re-stating layer 1 with `!important` in seven places. Any edit to `form-hybrid.css` colour must be checked against `GeoIpResolvedForm.astro` or it silently has no effect.

**8.6 — RESOLVED 2026-08-16.** `form-hybrid.css` is imported six times. Globally at `global.css:4` — which already puts it on every page including admin — plus redundantly at `full-form.astro:8`, `geoipform.astro:8`, `middle-form.astro:8`, `hybrid-form.astro:14`, `embed/form.astro:7`. The five page-level imports are no-ops; the global import means 22KB of checkout CSS ships with the admin dashboard.

**8.7 — RESOLVED.** Plus Jakarta Sans was loaded and never used. The imports were removed; `EmbedLayout` now intentionally inherits Inter from `foundation.css`, through `storefront.css`.

**8.8 — RESOLVED 2026-08-20.** Inter ships 400/600/700 and the public surface
wrote five weights. Measured in the browser rather than reasoned about: at 32 px
the string renders 323.02 px at both 400 and 500, and 327.33 px at 700, 800 and
900 — so `font-medium` was `font-normal` and `font-extrabold`/`font-black` were
`font-bold`. 72 occurrences were rewritten to what they actually render as, and
full-page screenshots of the home and catalogue pages are pixel-identical before
and after. The public ramp is 400 / 600 / 700 and nothing else.

**8.9 Breadcrumb re-derives the width branch.** `Breadcrumb.astro:20` reads `Astro.locals.tenant.storefrontTemplate` directly instead of accepting the `contentWidth` its host layout already resolved (`BaseLayout.astro:51`). A page overriding `contentWidth` gets a breadcrumb of the other width.

**8.10 — RESOLVED.** The resolved `themeColor` default is `#111111`, the storefront ebony, and it is emitted as `<meta name="theme-color">`. This entry previously reported a `#0F172A` default at a line number and under a symbol name that no longer exist; it was a defect report for a bug that had already been fixed.

**8.11 — RESOLVED 2026-08-18.** `.admin-shell` and the admin login stage are isolated in `src/styles/admin.css`, loaded only by `AdminLayout` and `/hello`; storefront requests receive `storefront.css` instead. Checkout remains route-owned in `form-hybrid.css`.

**8.12 The `wide-catalog` template shares no design language with `compact-market`.** Different canvas (`#FBFBFB` vs `#F8F7F4`), different neutrals (`zinc` vs custom hex), different accent (`emerald` vs `#C5A880`), different shape rule (`rounded-full`/`rounded-2xl` vs `rounded-none`), and it renders none of the `src/components/storefront/home/` sections. `ARCHITECTURE.md` §10 G6 already tracks the compile-time template set; the two templates being unrelated designs rather than two densities of one design belongs with it.

---

## 9. Verification

The commands CI runs, in order (`ARCHITECTURE.md` §9):

```bash
npm test          # node --test over src/lib/*.test.ts
npm run check     # astro check && tsc --noEmit
npm run build     # astro build
```

There is no screenshot-diff suite. `mobile-layout-guard.test.ts` prevents a known class of clipped implicit-grid regressions, but browser-visible work still requires a real browser check of interaction, focus, console, and horizontal overflow. Moving gate counts belong in `STATUS.md` / `BUILD-LOG.md`, not this design reference.
