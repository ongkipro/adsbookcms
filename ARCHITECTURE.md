# AdsBookCMS — System Architecture

> **Product:** AdsBookCMS (single) — a self-contained direct-response commerce CMS that installs onto Cloudflare Workers.
> **Install model:** **1 installer = 1 Worker = 1 store.** Isolation comes from the deployment boundary, not from request-time tenant routing.
> **This repository:** the product. It deploys nothing; each install deploys from its own repository against its own resources.
> **First install:** `permatamall.shop`, in the separate `ongkipro/permatamall` repository, carrying its own catalogue in its own database. Its `cmsads-*` resource names are legacy and deliberately not renamed.
> Verified against disk: 2026-08-17 @ `5cb1d32` + current A9 working tree

This document describes what the system **actually is**. Where the intended AdsBookCMS product differs from what ships today, the gap is stated explicitly in §10 rather than written as if it were already true. Code and executable evidence win over this document; when they disagree, fix the document.

---

## 1. Install Model

An AdsBookCMS install is one Cloudflare Worker with its own private resources:

| Resource | Binding | Instance value (reference deployment) |
| --- | --- | --- |
| Worker | — | one per install, named by that install |
| D1 database | `OMS_DB` | one per install |
| KV namespace | `SESSION` | sessions, rate-limit counters, idempotency keys |
| R2 bucket | `ASSET_BUCKET` | product uploads + CMS media |
| Workers AI | `AI` | content generation for the admin workbench |
| Static assets | `ASSETS` | `dist/client`, served by the Cloudflare adapter |

There is **no `env.<tenant>` block** in `wrangler.jsonc` and `definedEnvironments` in the built config is empty. One repository checkout deploys exactly one store. A second store means a second install: separate Worker, separate D1, separate bucket, separate domain.

**Why single-install instead of shared multi-tenant.** A shared runtime would require every query, cache key, session key, R2 object key, webhook lookup, and provider credential to carry a verified store scope. Today the data layer legitimately assumes one logical merchant (`SELECT ... FROM stores ORDER BY id LIMIT 1` is the canonical store read). Cloudflare also does not allow selecting a D1 binding from request input, so "one Worker, many databases" is not available without Workers for Platforms. The platform boundary is therefore the isolation boundary. See `DECISIONS.md` ADR-001.

---

## 2. Runtime Topology

```mermaid
flowchart TD
    V[Visitor] --> CF[Cloudflare edge · the install's domain]
    CF --> MW[src/middleware.ts]
    MW --> SSR[Astro SSR routes]
    MW --> API[/api/* endpoints/]
    SSR --> D1[(D1 · OMS_DB)]
    API --> D1
    SSR --> R2[(R2 · ASSET_BUCKET)]
    MW --> KV[(KV · SESSION)]
    API --> MG[Mengantar 3PL]
    API --> AL[AutoLaris payments]
    API --> META[Meta CAPI]
    API --> AI[Workers AI]
```

Every route is server-rendered: `astro.config.mjs` sets `output: 'server'` with the Cloudflare adapter. Nothing is prerendered, which is why the sitemap is hand-authored at `src/pages/sitemap.xml.ts` instead of using `@astrojs/sitemap`.

### Middleware responsibilities (`src/middleware.ts`)

Runs on every request, in order: canonical host redirect (`www` → apex), ad click-ID capture into first-party cookies, admin session validation against KV + `admin_credentials`, role-based admin route policy, same-origin enforcement on unsafe admin API methods, and the embed frame policy (replaces `X-Frame-Options: DENY` with a `frame-ancestors` CSP built from `stores.embed_allowed_origins`, failing closed to an empty allowlist on database error).

---

## 3. Route Surface

| Family | Entry points |
| --- | --- |
| Storefront | `/`, `/produk`, `/produk/[slug]`, `/404`, `/thanks`, `/payment` |
| Content pages | `/tentang`, `/kontak`, `/testimoni`, `/sitemap`, `/disclaimer`, `/kebijakan-privasi`, `/kebijakan-cookie`, `/syarat-ketentuan`, `/pengiriman` |
| Landing pages | `/[slug]` — catch-all resolved from D1 `landing_pages`; falls back to a 308 to `/produk/<slug>` when the slug is a product, else 404. Supports `?preview=1` behind an admin session |
| Checkout forms | `/hybrid-form`, `/middle-form`, `/full-form`, `/geoipform`, `/embed/form`. `/form-hybrid`, `/form-middle`, `/form-full` are query-preserving 308 redirects that **do** exist |
| Feeds | `/sitemap.xml`, `/feed/google-catalog.xml`, `/feed/meta-catalog.xml`, static `/robots.txt` |
| Media | `/assets/[...key]` (R2 `uploads/` prefix), `/media/[...key]` (R2 `content/` prefix) |
| Admin | `/hello` (login), `/admin/*` — 27 pages |
| Public API | `/api/*` — checkout, locations, shipping rates, payment methods, order status, Meta events |
| Headless API | `/api/v1/*` — storefront descriptor, products, geo, shipping rates, checkout, tracking events |
| Webhook | `/api/webhooks/autolaris` |

The headless `/api/v1/*` family is **implemented and shipping**, authenticated by `X-App-Key`/`Bearer` against the `developer_api_keys` table (`src/lib/headless-api.ts`) plus an origin allowlist. Keys are issued at `/admin/settings/developer`.

---

## 4. Data Layer

D1 is the only persistent store for operational state. **All runtime data access is raw `D1Database.prepare()` / `.batch()`** across 45 modules. There is no ORM and no schema-generation step: Drizzle was removed on 2026-08-16 (ADR-005), so `src/db/migrations/*.sql` is the only description of the schema in the tree.

### Tables (17)

`stores` · `warehouses` · `products` · `product_variants` · `orders` · `order_items` · `courier_rules` · `pickup_schedules` · `admin_credentials` · `payment_transactions` · `storefront_content` · `provider_dispatch_locks` · `seller_bank_accounts` · `capi_event_outbox` · `developer_api_keys` · `landing_pages` · `landing_sections`

`stores` is a single-row table that carries the runtime-editable half of the configuration: provider keys and base URLs, tracking IDs, fee-bearer policy, payment toggles, CRM templates, embed origins, AI content instructions, and COD province exclusions.

Stock integrity is enforced by the database, not the application: trigger `product_variants_stock_nonnegative` (migration `0003`) raises `INSUFFICIENT_STOCK` on any negative stock write.

### Migration chain

37 files, `0000`–`0036`, applied with `wrangler d1 migrations apply OMS_DB`, which reads the directory. Three migrations write data rather than schema: `0007` (bootstrap admin credential), `0018` (role rename), `0031` (order-number rewrite). `0017` used to seed a sample product; that insert was removed from the file itself — the documented exception to "never edit an applied migration", because the row it wrote violated a foreign key and aborted the whole chain at file 17 of 37, so no install could get past it.

**Migrations are hand-authored.** There is no generator to keep in sync, which is deliberate: the schema contains a data-integrity trigger, a DESC-ordered index, a CHECK constraint, and five data migrations — none of which a SQLite schema generator can represent. A generator that silently dropped the stock trigger would be worse than no generator.

---

## 5. Configuration Resolution — the sharpest edge in the system

Configuration comes from **three independent sources** that are easy to mistake for one:

| Source | Read path | Changes take effect after |
| --- | --- | --- |
| **D1 `stores` row** | `readStoreIdentity` → `resolveTenantConfig` in `src/lib/tenant.ts` | immediately |
| **Worker runtime env** | `getRuntimeEnv(locals)` in `src/lib/env.ts` | deploy (no rebuild needed) |
| **Build-time bundle** | `import.meta.env`, via `envTenantConfig` | `astro build` + deploy |
| **D1 `stores` row (provider half)** | `provider-config.ts`, `store-ads.ts`, `public-store.ts` | immediately |

Identity resolves **row first, env second, product default last**. Middleware reads
the `stores` row once per request and puts the resolved config on
`Astro.locals.tenant`, so the 125 consumers stay synchronous (ADR-003). The
`PUBLIC_SITE_*` vars are the fallback for a store that has not set a field, and
they do reach the bundle: `import.meta.env` is frozen by Astro at build time and
both `wrangler.jsonc` `vars` and a local `.env` feed it — verified by changing a
var in `wrangler.jsonc` alone and observing the new value in
`dist/server/chunks/env_*.mjs`.

> §5 previously described identity as baked into the bundle, and stated that
> `stores.name` and the resolved name were *different values*. That was true
> before migration `0036` and gap G1's closure, and it contradicted §10 four rows
> below. It also named a symbol, `tenantConfig`, that does not exist; the exports
> are `resolveTenantConfig`, `envTenantConfig`, `readStoreIdentity` and
> `loadStoreIdentity`.

Things to understand before touching identity:

- Renaming the store in `/admin` moves every storefront `<title>`, header,
  footer, JSON-LD and OG tag on the next request. No rebuild.
- `slug` resolves from `stores.slug`, then `PUBLIC_TENANT_SLUG`, then `"adsbook"`.
  The install wizard writes it per install. It is diagnostic only.
- An unknown `PUBLIC_STOREFRONT_TEMPLATE` **no longer throws**. It logs
  `tenant-unknown-storefront-template` and degrades to `compact-market`;
  `tenant.test.ts` asserts exactly that. It used to throw at module load, which
  in a Worker meant every route returned 500.
- `theme_color`, `locale` and `admin_name` have no admin editor yet. The store
  settings screen edits six fields: name, site_url, description, tagline, logo,
  storefront_template.

Provider credentials follow a **D1-first, env-fallback** rule: a key saved in the admin dashboard wins over the deployed secret, and `provider-config.ts` reports which one won as `source: "dashboard" | "server" | "none"`.

---

## 6. Authentication and Access

Session is a signed JWT in the `adsbook_session` cookie (`SESSION_COOKIE_NAME` in `src/lib/auth.ts` — the single source for the name), verified in middleware against a KV record and the `admin_credentials` row. `admin_credentials.updated_at` doubles as a session revision: rotating a credential invalidates existing sessions. Roles are defined in `src/lib/auth.ts` (`ADMIN_ROLES`) and enforced per route by `canAccessAdminRoute`.

The login route is `/hello` rather than `/admin/login`, and `robots.txt` — served from `src/pages/robots.txt.ts`, not a static file —
disallows `/admin/`, `/api/`, `/embed/`, `/hello` and `/install` **inside every
user-agent group**. Per RFC 9309 a crawler obeys only its most specific matching
group, so the named groups for Googlebot, Bingbot and the AI crawlers each need
their own copy; when they held nothing but `Allow: /`, those six crawlers saw no
disallows at all.

`src/lib/auth.ts` is covered by `src/lib/auth.test.ts` — 15 tests over signing,
verification, claim validation, role routing and the middleware gate itself,
including the normalized-path shapes that once walked past it.

> This paragraph used to read "currently has **no test coverage** … the
> highest-risk untested module in the repository", while that suite sat beside
> it. Believing it invites either a redundant second suite or an edit to
> `auth.ts` made on the assumption that nothing would catch it.

---

## 7. Commerce Flow

1. **Catalog** — `products` + `product_variants` in D1 carry identity, price, weight, and stock. `src/lib/catalog.ts` merges those operational rows with published presentation JSON from `storefront_content`.
2. **Form** — `/hybrid-form` resolves COD eligibility from trusted Cloudflare geo; a known eligible province routes to the middle form, a disabled or unknown province routes to the full form (`src/lib/form-mode.ts`).
3. **Rates** — `/api/shipping-rates` quotes Mengantar for the resolved destination, filtered by `courier_rules` and store-level COD province exclusions.
4. **Submit** — `/api/submit-order` persists order, items, and stock reservation atomically. It is rate-limited, honeypot-guarded, and idempotent via `submit_token`. **Checkout never dispatches to the courier.**
5. **Payment** — online orders create one AutoLaris transaction; `/api/webhooks/autolaris` reconciles payment state idempotently. Paid status changes dispatch *eligibility*, never dispatch itself.
6. **Dispatch** — an operator explicitly pushes eligible orders to Mengantar from `/admin/orders`. Requests run sequentially under a `provider_dispatch_locks` lease. Only an accepted provider response moves an order to `processing`.
7. **Tracking** — browser Pixel plus server-side Meta CAPI through `capi_event_outbox`, a durable transactional outbox with retry and a shared per-order `event_id` for deduplication.

---

## 8. Content Management

Two independent content systems:

- **Storefront content** (`storefront_content`) — draft/published JSON per content key, versioned, optionally generated by Workers AI from the live catalog, published explicitly from `/admin/content`. A product with no published row is **not** omitted: `mergeStorefrontCatalog` renders it from its own title, category and variants. The invariant is that no product ever borrows another product's or another merchant's copy — not that unpublished products disappear.
- **Landing pages** (`landing_pages` + `landing_sections`) — an ordered section builder with `html` and `form` section types, rendered by the `/[slug]` catch-all.

Home content does **not** currently fail closed: when no published home row
exists, `src/lib/tenant-content.ts` falls back to `buildDefaultHomeContent`,
which composes a shell from *this* store's resolved identity. It is not silent —
the fallback logs `home-content-unpublished` — but for an installer product it is
still the wrong default; a fresh install should render an honest setup state.
Tracked in §10 and as task A-12b.

---

## 9. Build and Release

```
this repo:   push to main → .github/workflows/ci.yml → npm ci → npm run check → npm test → npm run build → stop
an install:  push to main → its own deploy workflow → …same gates… → npx wrangler deploy → live traffic
```

**This repository deploys nothing.** CI runs check, test and build. Deployment happens from an install's own repository, against that install's Worker and database, and pushing to `main` there is what reaches live traffic. Release detail lives in `RELEASE.md`.

Local verification, in the order CI runs it:

```bash
npm test          # node --test over src/lib/*.test.ts
npm run check     # astro check && tsc --noEmit
npm run build     # astro build
```

npm is authoritative (`package-lock.json`, `npm ci` in CI). This is a single-package repository; the pnpm workspace stub and its stale lockfile were removed on 2026-08-16 and neither file exists.

---

## 10. Gap Register — what AdsBookCMS still needs

These are the differences between what ships today and the intended installable
product. **Three are open: G3, G5, G6.** Struck-through rows are closed and are
kept so that a document elsewhere still describing them as open can be recognised
as stale rather than believed.

| # | Gap | Why it blocks the installer | Primary surface |
| --- | --- | --- | --- |
| ~~G1~~ | ~~Identity is build-time~~ | **Closed 2026-08-16.** Migration 0036 moved identity into `stores`; middleware resolves it once per request onto `Astro.locals.tenant`; `/admin/settings/store` edits six of the nine fields (`theme_color`, `locale` and `admin_name` have no editor yet) without a rebuild | `src/lib/tenant.ts`, `src/middleware.ts` |
| ~~G2~~ | ~~No `/install` wizard~~ | **Closed 2026-08-16.** A migrated database with no store row routes to `/install`; the wizard writes identity and the operator's credential in one batch and then refuses to run again | `src/pages/install.astro`, `src/lib/install.ts` |
| G3 | No schema auto-upgrade | Each install is upgraded manually. Runtime health compares `schemaVersion` with `d1_migrations`, but it reports drift rather than applying migrations | `src/lib/schema-version.ts`, migration runner |
| ~~G4~~ | ~~Sample product is another merchant's~~ | **Closed 2026-08-16.** Migration `0034` removes the foreign row under identity and order-reference guards; the immutability concept was dropped rather than repointed, since the demo catalog already serves the purpose and is fully editable | `src/db/migrations/0034_remove_foreign_sample_product.sql` |
| G5 | Home *shell* falls back to built-in copy | Narrowed 2026-08-17 (ADR-016): no dataset ships, and the product section, `/produk` and `/kontak` all render explicit empty states. What remains is the shell — `getTenantHomeContent` never returns `null`, so the operator setup branch is unreachable (A-12b) | `src/lib/tenant-content.ts` |
| G6 | Theme set is compile-time | Templates can now be *switched* from `/admin/settings/store`; **adding** one still needs a rebuild | `src/lib/tenant-contract.ts` |
| G7 | Partial observability | Workers Logs are on and `/api/admin/health` reports per-install state; there is still no error reporting, no alerting and no cross-install view | `OBSERVABILITY.md` |
| ~~G8~~ | ~~Drizzle journal broken~~ | **Closed 2026-08-16.** Drizzle retired rather than repaired: its snapshots could not represent the stock trigger, so a repaired generator would have emitted SQL that silently dropped a data-integrity guarantee (ADR-005) | — |
| ~~G9~~ | ~~Meta Purchase deduplication is broken~~ | **Closed 2026-08-16.** Both legs now key on the `INV-` order number. Historical data stays inflated — Meta offers no retroactive merge | `src/components/tracking/MetaThanksTracker.astro` |
| ~~G10~~ | ~~Embedded checkout fired Purchase before verified confirmation~~ | **Closed 2026-08-16.** Embedded forms now send only a constrained completion-navigation message; the parent navigates to the same verified `/payment` or `/thanks` flow, whose browser and CAPI legs share the order number as `event_id` | `src/lib/embed-markup.ts`, `src/lib/checkout-navigation.ts` |

---

## 11. Non-Goals

- Request-time tenant routing by `Host` inside one Worker.
- Selecting a D1 binding from request input.
- Workers for Platforms / customer-authored Worker code.
- Public self-service signup. Installs are provisioned deliberately, one at a time.
