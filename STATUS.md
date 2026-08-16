# STATUS — AdsBookCMS

> Verified against disk: 2026-08-17 @ `c6e7dd2`
>
> `main` was re-founded as AdsBookCMS and its history rewritten (ADR-012), so the
> commit range this document once cited no longer exists on this branch; the
> previous 61 commits are preserved on `backup/pre-history-rewrite`. Gates re-run
> on the current tree, not inherited: `npm run check` 317 files / 0 errors /
> 0 warnings / 0 hints · `npm test` 303 / 303 · `npm run build` Cloudflare server
> bundle complete.

Current state of the system. Implemented behaviour lives here; history lives in `BUILD-LOG.md`; remaining work lives in `UNIMPLEMENTED_SPECS.md`; structure lives in `ARCHITECTURE.md`.

The previous version of this file described a different repository — it opened by declaring the project to be another merchant's preview deployment, listed that merchant's catalog as this store's, and cited a D1 database belonging to a different account. It has been rewritten from the tree rather than patched.

---

## 1. What this repository is

| Field | Value |
| --- | --- |
| Product | AdsBookCMS (single) |
| Repository role | **Product.** Deploys nothing; CI runs check, test and build only |
| Install model | 1 installer = 1 Worker = 1 store (ADR-001) |
| Version | `1.2.0` / `2026.08-hardened` (`src/lib/version.ts`) |
| Schema | 37 migration files, `0000`-`0036` |
| Bindings | `OMS_DB` (D1), `SESSION` (KV), `ASSET_BUCKET` (R2), `AI`, `ASSETS` — names fixed across installs |
| `wrangler.jsonc` | template of placeholders; each install supplies its own resources |

### Known installs

| Install | Repository | Notes |
| --- | --- | --- |
| `permatamall.shop` | `ongkipro/permatamall` | First install. Carries the bundled demo dataset (ADR-011). Its Cloudflare resources keep legacy `cmsads-*` names |

As of the split on 2026-08-16, the fixes recorded below live in this repository. Whether and when an install adopts them is that install's own deploy decision.

---

## 2. Verification baseline

| Gate | Result |
| --- | --- |
| `npm test` | **303 / 303 passing** |
| `npm run check` | 317 files · 0 errors · 0 warnings · 0 hints |
| `npm run build` | Cloudflare server bundle complete |
| Browser smoke | Public 8/8 menu routes and current-role admin menu/profile 5/5 returned 200 at the expected path; public and admin skip links target the main content; no horizontal overflow at 390 px |

---

## 3. What is implemented

**Storefront** — SSR home with two selectable templates, product listing with progressive load-more, product detail with variant selection and sticky mobile CTA, custom 404 with related products, hand-authored `sitemap.xml`, Google and Meta catalog feeds, JSON-LD (Organization, WebSite, Product, ItemList, Breadcrumb).

**Landing pages** — D1-backed builder with ordered `html` and `form` sections, drag reorder, shortcode pills, 480px mobile canvas preview, rendered through the `/[slug]` catch-all with admin-gated `?preview=1`.

**Checkout** — three form modes (hybrid, middle, full) plus a geo-resolved variant and a cross-origin embed. Province-based COD gating from trusted Cloudflare geo, district autocomplete over a 7,285-district index, live Mengantar rate quotes, honeypot and rate-limit guards, `submit_token` idempotency, atomic order + items + stock reservation.

**Payments** — COD, manual bank transfer with seller bank accounts, and AutoLaris QRIS/VA with per-channel toggles, fee-bearer policy (buyer or seller) for both payment and COD fees, a dedicated instruction page with copy-to-clipboard and countdown, and idempotent webhook reconciliation.

**Orders and shipping** — operator-controlled dispatch to Mengantar under a single-flight lease, sequential shipment creation with independent per-order results, pickup address and schedule synchronisation with the provider, receiver RTS scoring, and a shipping lifecycle view separate from pending intake.

**Admin** — 27 pages: dashboard analytics, orders and order detail, product CRUD, landing pages, content workbench with Workers AI drafting, shipping, expeditions, RTS/rate checker, payments, balance reconciliation ledger, ads configuration for Meta and Google, store/warehouse/CRM settings, operator access management, and developer API keys. Navigation and route authorization share one deny-by-default role policy; scoped operators see only the complete workspace their role owns.

**Headless API** — seven `/api/v1/*` routes (storefront descriptor, products list and detail, district lookup, shipping rates, checkout, tracking events) authenticated by API key against `developer_api_keys`. The independently validated Headless origin allowlist is persisted on `stores.headless_allowed_origins` and editable in Developer settings.

**Tracking** — Meta Pixel plus server-side CAPI through a durable outbox with retry and a shared, order-derived `event_id`; Google Tag and Ads conversion configuration with region-scoped Consent Mode v2; TikTok event hooks; and click-id capture for `gclid`/`gbraid`/`wbraid`/`fbclid`/`ttclid`. Hosted and embedded checkout surfaces emit Purchase only after the order can be resolved and verified.

---

## 4. Data state

17 tables. `stores` is a single row carrying provider keys, tracking ids, fee policy, payment toggles, CRM templates, independent embed and Headless origin policies, AI instructions, and COD province exclusions.

Live catalog: 22 women's handbag products with 110 variants, seeded by `scripts/seed-catalog.sql`.

Known data issues, all tracked:

- The local development D1 still holds the previously provisioned warehouse row — a real address, phone number, and Mengantar ObjectIds. The repository is clean, but that data lives in local state and presumably in the remote database; scrubbing it needs a remote write and is a separate decision.
- The demo seed is `scripts/seed-catalog.sql`, run with `npm run db:reset:demo:local`. It is **destructive to the catalog** by design — a demo seed's job is a known state — but its deletes are guarded so they never touch order history. The former `src/db/seed.sql`, which held two previous merchants' catalogs plus genuine-looking provider ids, a real address and a real phone number, was deleted on 2026-08-16.
- Migration `0017` aborted the chain on an empty database, so **no new install could be created**; fixed 2026-08-16 by removing the sample-data insert it carried. All 37 migrations now apply from zero.

---

## 5. Work completed on 2026-08-16

Content and identity cleanup, on branch `chore/adsbookcms-foundation`:

- Legal pages templated on `{{store}}` and resolved at render, replacing hardcoded references to a previous merchant on `/syarat-ketentuan`, `/disclaimer`, and `/kontak`. `/kontak` now renders the support WhatsApp number from D1 instead of a foreign one, and the foreign operational address was removed rather than replaced with an invented one.
- `/disclaimer` fixed — the page had an unterminated frontmatter block, so the route never compiled and returned 404 in production while remaining listed in `sitemap.xml`.
- Page metadata on `/tentang`, `/testimoni`, `/sitemap`, and `/kebijakan-cookie` switched from a third merchant's brand to `resolveTenantConfig(...).name`.
- Default home hero copy replaced with neutral text; the previous default described an agriculture and household catalog.
- Fallback merchant name in CRM templates and the fallback product name on `/thanks` neutralised.
- Deleted: five dead components carrying legacy campaign logic, the unreferenced `siteContact` block with a foreign email, WhatsApp, and address, and roughly 39 MB of another merchant's images and articles that were publicly fetchable on this domain (`public/` went from 67 MB to 28 MB).
- Documentation re-founded: `ARCHITECTURE.md`, `DECISIONS.md`, `RELEASE.md`, and `OBSERVABILITY.md` created; `README.md`, `INSTALLATION.md`, `AGENTS.md`, and this file rewritten; `CLOUDFLARE_MULTI_TENANT.md`, `AUTO_UPDATE_DEPLOY.md`, `design-tokens.md`, and the `doc/` preview site deleted as upstream-engine material.

System-wide security, correctness, documentation, navigation, and UX audit:

- Hardened admin bootstrap, JWT verification, KV-backed session validation, password rotation invalidation, exact role routing, and deny-by-default API/page access. **Correction (2026-08-17):** this said the built-in default password "fails
  closed unless a strong bootstrap secret is explicitly configured". It does not,
  and deliberately so — that behaviour shipped, made a fresh install unopenable,
  and was reverted (PRD.md REQ, `PRD-ADMIN-LOGIN.md` LOGIN-1/LOGIN-2). A new
  install opens with `admin` / `admin`, and a session on that credential reaches
  nothing but its own password change. Anyone believing this line either ships an
  install they cannot enter, or leaves a live default they think is disabled.
- Converted public order status to token-scoped `POST` JSON; completion routes keep identifiers in same-origin `sessionStorage`, strip query strings before subresources load, and send `Cache-Control: no-store`. Checkout, payment, thanks, Meta browser tracking, and CAPI now share the same order-derived event identity.
- Separated iframe embed origins from Headless API origins. Migration `0035` persists the Headless allowlist; Developer settings validates and saves it; all `/api/v1/*` routes still require an active API key.
- Closed inactive-product exposure, landing-preview cache, custom-HTML preview injection, legacy embed redirect, catalog identity, and public cache-control defects. Removed dead completion-query builders after the safe navigation boundary made them redundant.
- Centralised admin navigation contracts, aligned menu visibility with authorization, repaired nested `<main>` landmarks, and made public/admin skip links target the actual main content.
- Reconciled repository specifications, architecture, installation notes, storefront integration guidance, remaining-gap register, and migration `0034` behaviour with the executable tree.
- Independent final security review found no exploitable finding in the audited trust boundaries. Remaining work below is product/operations debt rather than a known open vulnerability.

---

## 6. Known issues

| Severity | Issue |
| --- | --- |
| High | The admin gate read the raw request path while Astro routed on a normalized one, so `//api/admin/...` bypassed every check — fixed 2026-08-17, pinned by `middleware-path-source.test.ts` and `auth.test.ts` |
| Medium | There is no automatic schema-upgrade path (**G3**) |
| Medium | Fresh-install home content and compile-time theme selection remain coupled to repository defaults (**G5**, **G6**) |
| Medium | Headless key scope/quota, authenticated order-status read, a published OpenAPI contract, and an executable adapter remain open (**H4**, **H6**, **H7**, **H8**) |
| Medium | Alerting and a cross-install view remain absent; Workers Logs and the per-install health endpoint exist (**G7**, `OBSERVABILITY.md`) |
| Blocked | Unpaid-order recovery and several provider edge contracts require an explicitly approved live capture before implementation |
| Data note | Local/remote D1 may still contain a previously provisioned warehouse address, phone, and provider ObjectIds; scrubbing it is a separate destructive/remote-data action |

---

## 7. Distance to the product goal

AdsBookCMS is intended to install like WordPress: point a domain at it, open the
site, fill in a form. That path now exists end to end — an empty database
redirects to `/install`, the wizard writes the store and the operator's own
credential, and the wizard locks itself afterwards. It has been exercised against
a real Worker on a real empty D1, not only in tests.

**Three** structural gaps remain open — **G3**, **G5**, **G6** — tracked in
`ARCHITECTURE.md` §10, with constraining decisions in `DECISIONS.md`. G1, G2, G4,
G8, G9 and G10 are closed.
