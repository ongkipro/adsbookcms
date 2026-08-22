# STATUS — AdsBookCMS

> Last executed baseline: 2026-08-22 @ `359a1e2` + the A19 operator-notification
> working tree merged in. `main` was re-founded as AdsBookCMS and its history
> rewritten (ADR-012), so the commit range this document once cited no longer
> exists on this branch; the previous 61 commits are preserved on
> `backup/pre-history-rewrite`. Gates re-run on the current tree, not
> inherited: `npm run check` 367 files / 0 errors / 0 warnings / 0 hints ·
> `npm test` 479 / 479 · `npm run build` Cloudflare server bundle complete.

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
| Schema | 47 migration files, `0000`-`0046` |
| Bindings | `OMS_DB` (D1), `SESSION` (KV), `ASSET_BUCKET` (R2), `AI`, `ASSETS` — names fixed across installs |
| `wrangler.jsonc` | template of placeholders; each install supplies its own resources |

### Known installs

| Install | Repository | Notes |
| --- | --- | --- |
| `permatamall.shop` | `ongkipro/permatamall` | First install. Holds its own catalogue in its own database; nothing is bundled here any more (ADR-016). Its Cloudflare resources keep legacy `cmsads-*` names |

As of the split on 2026-08-16, the fixes recorded below live in this repository. Whether and when an install adopts them is that install's own deploy decision.

---

## 2. Verification baseline

| Gate | Result |
| --- | --- |
| `npm test` | **479 / 479 passing**, with zero notification writes failing open unnoticed (grepped for after the A19 review found four fixtures swallowing them) |
| `npm run check` | 368 files · 0 errors · 0 warnings · 0 hints |
| `npm run build` | Cloudflare server bundle complete; 47 bundled migrations |
| Browser smoke | A fresh isolated install exposed all ten default couriers through `/api/admin/expeditions`. `/admin/orders/abandoned` rendered its shadcn Card/Badge/Button/Dialog composition at 390, 768, and 1280 CSS px with zero overflow, no stuck busy state, no failed request, and no console error. A populated lead opened the conversion Dialog, focused the invalid address, and returned focus after `Escape`. A separate isolated owner session on `/admin/balance` rendered pending and locked AutoLaris rows, blocked blank manual-confirmation submission with focused inline errors, and an already-confirmed payment redirected `/payment` to `/thanks` with zero console errors. No live provider request, deployment, or remote D1 mutation occurred. |
| Live provider read | On 2026-08-19 the repository's own clients were exercised against the real providers. Mengantar: `searchAddress("Cihapit")` resolved one area and `estimateRates` returned ten couriers with real prices (JNE Rp11.000, SiCepat Rp8.500, SAP Rp10.500). Read-only; no order, pickup, or D1 write. AutoLaris: `createPayment` on the provider's **published development key** returned a real virtual account for a Rp118.400 order, and `inquirePayment` read it back as `PENDING`. No production AutoLaris credential was used, no deployment occurred, and no remote D1 was touched. |

---

## 3. What is implemented

**Storefront** — SSR home that remains available when optional homepage content is unpublished, product listing with progressive load-more, product detail with variant selection and sticky mobile CTA, custom 404 with related products, hand-authored `sitemap.xml`, Google and Meta catalog feeds, JSON-LD (Organization, WebSite, Product, ItemList, Breadcrumb). The public component and CSS boundaries are isolated under `components/storefront/` and `styles/storefront.css`.

**Landing pages** — D1-backed builder with ordered `html` and `form` sections, drag reorder, shortcode pills, 480px mobile canvas preview, rendered through the `/[slug]` catch-all with admin-gated `?preview=1`. Every landing page answers at `domain/<slug>` with no path prefix. One active landing page may take over its product's page: `/produk/<product-slug>` then renders it and is its canonical address while its own slug answers `308` there, so exactly one URL is live and neither sitemap advertises the redirecting one. Only owner and admin may claim or release a product page; `advertiser` builds landing pages but does not decide what the storefront serves. A partial unique index allows only one holder per product, and releasing or unpublishing the claim returns the product URL to the standard product template rather than 404ing it. Operator-authored HTML renders into `.lp-section`, whose rhythm, type contract, and overflow safety live in `styles/landing-pages/landing.css`.

**Checkout** — three form modes (hybrid, middle, full) plus a geo-resolved variant and a cross-origin embed. Province-based COD gating from trusted Cloudflare geo, district autocomplete over a 7,285-district index served entirely from the local catalogue (no provider call per keystroke), with a separate KV-cached `level=resolve` step (24h) that maps the picked district to Mengantar's real destination id only once a candidate is selected, live Mengantar rate quotes that never request the provider COD fee, so the store's own COD service fee cannot be billed twice, honeypot and rate-limit guards, `submit_token` idempotency, atomic order + items + stock reservation, one atomic order-number allocator, and scheduled abandoned-order retention. Qualified unsubmitted leads retain a per-tab set of successful normalized identity/product fingerprints: identical combinations are suppressed across blur and reload, changed combinations may capture, and failed capture or unavailable storage fails open. Submitted non-COD checkouts remain real orders with pending shipping; successfully-created unpaid VA/QRIS and bank transfer remain payment-pending, while an explicit AutoLaris creation failure may be payment-failed.

**Payments** — COD, manual bank transfer with seller bank accounts, and AutoLaris QRIS/VA with per-channel toggles enforced at listing and submit boundaries, fee-bearer policy (buyer or seller) for both payment and COD fees, and a dedicated instruction page with copy-to-clipboard, countdown, token-scoped CMS-status refresh, and automatic `/thanks` replacement after the server confirms payment. Online checkout creates one AutoLaris payment through `POST /api/h2h/create_payment` — the gateway path, carrying buyer payment identity and the fee-policy amount only. No shipping data reaches AutoLaris; that is Mengantar's. Manual seller-bank transfers remain visible in analytics but are excluded from AutoLaris reconciliation. Because no settled `POST /api/h2h/advice` response has been observed, an owner/admin must still verify the provider dashboard and re-enter the exact recorded total and provider reference before the CMS marks the payment paid. Owner and admin can read one transaction's provider state on demand from the reconciliation queue; that read writes nothing, cannot mark a payment paid, and flags the case that matters — the provider reporting an unpaid transaction this store has already marked paid. Every accepted transition is atomic, idempotent, append-only audited, and blocked for released or incompatible orders. The legacy webhook is retired. Paid confirmation changes shipping eligibility only and never dispatches automatically.

**Orders and shipping** — one shared lifecycle validates every single/bulk status transition, restores reserved stock exactly once on cancellation or deletion, and prevents destructive removal after provider dispatch. **Pesanan tertinggal** has a dedicated product-first lead workspace and is excluded from normal order lists, summaries, details, bulk actions, and shipping. CS can record follow-up and explicitly convert one ABN lead into one complete pending INV with a current server-side rate and exactly-once stock reservation. Checkout, conversion, and payment confirmation only persist or change eligibility. Mengantar dispatch runs solely after an explicit authenticated single/bulk operator action under a single-flight lease; provider acceptance rechecks the claim and dispatch-critical snapshot so concurrent cancellation or buyer edits cannot be overwritten. Accepted provider identifiers and provider-supplied waybills persist, duplicates are suppressed, and bounded failures remain pending and retryable. The Shipping workspace exposes exactly **Semua Pengiriman**, **Perlu Dibuatkan Resi**, **Perlu Pickup**, and **Sampai Tujuan**, with responsive state-valid actions and explicit sequential provider polling by waybill. `/order/pay-unpaid` recovery remains provider-blocked.

**Admin** — 27 pages: dashboard analytics, orders and order detail, product CRUD, landing pages, content workbench with Workers AI drafting, shipping, expeditions, RTS/rate checker with an optional COD value that reveals the provider's own COD fee for comparison, payments, balance reconciliation ledger, ads configuration for Meta and Google, store/warehouse/CRM settings, operator access management, and developer API keys. The JSON/AI content workbench is off the main navigation (ADR-018); `/admin/content` itself stays reachable and unchanged — it is no longer gated behind the storefront's setup-required state, since the home page now always renders. Warehouse settings create the required single-row origin on a fresh install and update it thereafter. Fresh installation also creates the neutral ten-courier policy; migration `0042` repairs only installed stores with no courier rows and never overwrites an existing policy. Navigation and route authorization share one deny-by-default role policy. Phones use role-aware bottom navigation and sheets, tablet starts with a 48 px rail, desktop uses a 256 px sidebar, and first-run sessions expose only password rotation and logout.

**Reporting periods** — the dashboard, order list, and shipping workspace share one period control: the same presets plus an explicit start/end range entered through the platform's own date input, with no date-picker dependency. A period the server cannot resolve is refused with a stated reason rather than silently answered as the 7-day default, which is what the order and shipping routes used to do with any unrecognised value. Each surface declares its own ceiling — 31 days on the dashboard, which charts every day in the period, against 180 on the lists — and the control states that ceiling and enforces it in the inputs. The order list's summary cards follow every active filter, and its status chips follow all of them except the status they select, so a one-day period no longer shows that day's rows beside an all-time total. The analytics range requires both ends, so no dated request escapes the ceiling through a half-open range.

**Operator notifications** — a new order, a missed-order lead, and a cleared payment each record exactly one notification, enforced by a unique index on `(type, order_id)` rather than by the caller. Recording is fail-open and can never affect the commerce write that triggered it. The admin topbar carries an unread badge and a panel, newest first, with read state per operator so one person clearing the badge does not blind the team; `advertiser` is refused the endpoint entirely. A browser notification is raised while an admin page is open, at most once per event per browser. Delivery while no admin page is open needs Web Push and is specified (`REQ-153`) but unbuilt.

**Headless API** — nine `/api/v1/*` routes authenticated by API key and independently origin-checked. Every operation has a minimum scope; origin denials occur before quota, minute denials do not spend daily quota, and D1 records the final handler status exactly once without request payloads. The order-status route requires the order number plus its public status token and returns no customer PII.

**Tracking** — Meta Pixel plus server-side CAPI through a durable outbox with retry and a shared, order-derived `event_id`, with one shared identity normalizer (`meta-identity.ts`) so the browser and server legs hash the same person; Google Tag and Ads conversion configuration with region-scoped Consent Mode v2; TikTok event hooks; and click-id capture for `gclid`/`gbraid`/`wbraid`/`fbclid`/`ttclid`. Hosted and embedded checkout surfaces emit Purchase only after the order can be resolved and verified. Product ID is the canonical advertising identity: the API `content_id`, Meta `content_ids`, Google ecommerce `item_id`, and `<g:id>` in both catalog feeds are the same numeric value with at least five digits; variants remain separate checkout selections.


---

## 4. Data state

21 tables. `stores` is a single row carrying provider keys, tracking ids, fee policy, payment toggles, CRM templates, independent embed and Headless origin policies, AI instructions, and COD province exclusions. `order_number_counters` owns collision-free numbering; Headless usage/audits and runtime storefront definitions have dedicated tables.

Catalog: **empty by default**. No dataset ships (ADR-016); an install starts with no products and the storefront renders an explicit setup state until the operator publishes home content and adds products.

Known data issues, all tracked:

- The local development D1 may hold a previously provisioned warehouse row with address, phone, and Mengantar identifiers. Remote state was not read and is explicitly unverified; any local or remote scrub is a separate destructive-data decision.
- No seed ships. `scripts/seed-catalog.sql`, `public/images/products/` and `db:reset:demo:local` were removed on 2026-08-17 (ADR-016); whether to reintroduce sample data, and in what form, is deferred rather than decided against. The earlier `src/db/seed.sql`, which held two previous merchants' catalogs plus genuine-looking provider ids, a real address and a real phone number, was deleted on 2026-08-16.
- Migration `0017` once aborted the chain on an empty database; that insert was removed 2026-08-16. All 44 migrations now apply from zero, and the Worker applies a valid missing suffix automatically before database-backed requests. Migration `0040` adds persisted provider status text, provider event time, and synchronization time to `orders`; migration `0041` adds persisted missed-order follow-up state; migration `0042` restores the neutral courier catalogue only for stores with an empty policy; migration `0043` adds immutable manual-payment reconciliation evidence.

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
- Published the authenticated OpenAPI 3.1 contract and framework-neutral server adapter for the complete Headless commerce journey. External tracking now preserves the allowlisted storefront origin instead of replacing it with the CMS origin, while the developer key remains server-side.
- The 2026-08-17 repository audit found open correctness and abuse-control defects. They are recorded in §6 and `UNIMPLEMENTED_SPECS.md`; the earlier statement that no exploitable finding remained is superseded.

---

## 6. Known issues

| Severity | Current fact |
| --- | --- |
| Release blocker | Automatic AutoLaris paid marking stays disabled. The inquiry endpoint `POST /api/h2h/advice` exists and is implemented, but only its **pending** response has been observed; capturing a settled one means paying a real virtual account. Owner/admin manual confirmation remains the sole path that marks a payment paid. |
| Release blocker | AutoLaris production access requires an IP allowlist of at most five addresses. Cloudflare Workers have no fixed egress address, so no install is AutoLaris-production-ready on current evidence. |
| Medium | Product-grain feeds still need a truthful standard-identifier policy and stable out-of-stock publication contract. |
| Medium | Theme colour, locale, and admin display name resolve from D1 but still lack complete admin editors. |
| Medium | External uptime checks and a cross-install operational view do not exist; per-install schema/CAPI alerting does. |
| Blocked | Mengantar tracking, pickup, insufficient-wallet recovery, and wallet balance still require canonical provider contracts or explicitly approved sandbox/live evidence. |
| Release evidence | Commit `09812c7` plus the A17 working tree has local test/check/build and isolated browser evidence, but no hosted CI result, production-D1 preflight, or install-specific provider smoke. |
| Data note | Local/remote D1 may still contain a previously provisioned warehouse address, phone, and provider ObjectIds; scrubbing it is a separate destructive/remote-data action |

---

## 7. Distance to the product goal

AdsBookCMS is intended to install like WordPress: point a domain at it, open the
site, fill in a form. That path now exists end to end — an empty database
redirects to `/install`, the wizard writes the store and the operator's own
credential, and the wizard locks itself afterwards. It has been exercised against
a real Worker on a real empty D1, not only in tests.

All ten structural gaps in `ARCHITECTURE.md` §10 are closed. Remaining audited
defects, documentation debt, integration deliverables, and provider-blocked work
are tracked only in `UNIMPLEMENTED_SPECS.md`.
