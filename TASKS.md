# Tasks: AdsBookCMS

> Verified against disk: 2026-08-17 @ `3de2b01`

## Provenance — read before citing any task

Phases 1–80 (T1–T295) were inherited from the upstream CMSAds engine when this repository was forked on 2026-08-15. They are lineage, not an active backlog, and they carry known structural damage:

- **Phase numbers 71–80 appear twice** with different subjects.
- **T243 and T244 do not exist**; numbering jumps from T242 to T245.
- **Traceability is broken from T266 onward** — those tasks reference `SEC-*`, `PAY-*`, `ORD-*`, `TRK-*`, `TYP-*`, `DOC-*`, `CAT-*`, and `UI-*` identifiers that exist in no version of `PRD.md`.
- Several completed tasks assert behaviour that is false in this repository, most importantly T71 (`./scripts/install.sh` — the file does not exist) and T100/T107 (pushing to `main` does not deploy — correct for this repository; ADR-012 and `ci.yml`).
- T174 and T175 remain unchecked although the contracts they describe now ship.

Historical rows are left exactly as they landed. Do not retro-fit them and do not treat an inherited `[x]` as evidence. Active work starts at **Phase A** at the end of this file and references the requirement IDs in the current `PRD.md`.

---

## Rules for AI Agent

- Execute work in traceable slices and use the smallest runnable proof that exercises the changed contract; build/typecheck alone do not prove browser behavior or live-provider side effects.
- Maintain requirement traceability: every implementation task names its owning requirement (`-> REQ: REQ-x`).
- Completed rows preserve the historical status recorded when they landed. New or still-open backlog items use one primary requirement plus optional constraints; unchecked items labelled historical/superseded are lineage only, not active backlog.
- Do NOT introduce unrequested abstractions, uncoordinated colors, or AI slop tells.

---

## Phase 1: Design Tokens & Layout Architecture

- [x] **T1** — Design Tokens Specification (`design-tokens.md`).
      -> REQ: REQ-2 · deps: [] · Done when: single Agricultural Emerald & Slate color tokens created in `design-tokens.md` and `ui-variants.ts`.
- [x] **T2** — Mobile-First 480px Container (`BaseLayout.astro`).
      -> REQ: REQ-1 · deps: [T1] · Done when: storefront layout wraps content in `max-w-[480px]` container centered with backdrop shadow.
- [x] **T3** — Clean Non-Sticky Header & Top Announcement Bar (`SiteHeader.astro`).
      -> REQ: REQ-4 · deps: [T1] · Done when: non-sticky clean header renders top announcement bar and `SiteBrand` logo without AI tells.
- [x] **T4** — Mini Store Direct-Response Footer (`SiteFooter.astro`).
      -> REQ: REQ-5 · deps: [T1] · Done when: streamlined footer renders 6 legal links and copyright note.

## Phase 2: Frameless Product Photography & Storefront Pages

- [x] **T5** — Frameless Pure-White Product Showcase Grid (`ProductsSection.astro`).
      -> REQ: REQ-3 · deps: [T1] · Done when: product photos sit frameless directly on pure white canvas (`bg-white`).
- [x] **T6** — Product List Item & PDP Photography (`ProductListItem.astro`, `[slug].astro`).
      -> REQ: REQ-3 · deps: [T5] · Done when: product images in catalog and detail pages render frameless on pure white canvas.
- [x] **T7** — Storefront 6 Legal Policy Routes (`/kebijakan-privasi`, `/syarat-ketentuan`, etc.).
      -> REQ: REQ-5 · deps: [T4] · Done when: all 6 legal policy pages return HTTP 200 OK with `max-w-[480px]` container.

## Phase 3: Order Engine & AutoLaris Payment Integration

- [x] **T8** — Order Submission API (`/api/submit-order` & `/api/submit-middle-order`).
      -> REQ: REQ-10 · deps: [] · Done when: POST payload creates order & order_items records in Cloudflare D1.
- [x] **T9** — AutoLaris Webhook Receiver (`/api/webhooks/autolaris`).
      -> REQ: REQ-11 · deps: [T8] · Done when: valid webhook callback updates `payment_status = 'paid'` in D1.
- [x] **T10** — Token-Protected Payment Status and Instructions API (`/api/order-status`).
      -> REQ: REQ-12 · deps: [T9] · Done when: GET with matching order identity and `public_status_token` returns current D1 status plus the latest recorded payment instructions without customer PII, while unknown or mismatched orders fail closed.

## Phase 4: Tracking & Meta CAPI Edge Resolver

- [x] **T11** — Edge D1 Store Ads Config Resolver (`getStoreAdsConfig`).
      -> REQ: REQ-7 · deps: [] · Done when: `src/lib/store-ads.ts` fetches pixel & token from D1 with env fallback.
- [x] **T12** — Meta Pixel Advanced Matching & Dual Deduplication (`MetaThanksTracker.astro`).
      -> REQ: REQ-6, REQ-8, REQ-9 · deps: [T11] · Done when: SHA-256 matched Purchase fires on `/thanks` without duplicate counts on reload.
- [x] **T13** — Meta CAPI Server Trigger (`/api/meta-event.ts`).
      -> REQ: REQ-6, REQ-7 · deps: [T11] · Done when: POST `/api/meta-event` sends server CAPI event with D1 pixel credentials.

## Phase 5: Production Verification & Build Proof

- [x] **T14** — Production Verification & Build Proof.
      -> REQ: REQ-1..12 · deps: [T1..T13] · Done when: `npm run check` returns 0 errors and `npm run build` succeeds.

## Phase 6: Storefront Checkout & Logistics Integration

- [x] **T15** — Mengantar Client Library (`src/lib/mengantar-client.ts`).
      -> REQ: REQ-14, REQ-38 · deps: [] · Done when: `MengantarClient` provides typed address, pickup, rate, receiver-history, and shipment transport methods with a 10-second timeout; application-level shipment/pickup workflows remain tracked separately.
- [x] **T16** — Address Autocomplete API (`/api/locations`).
      -> REQ: REQ-13 · deps: [T15] · Done when: `GET /api/locations?search=<prefix>&level=district` returns only matching kecamatan from the bundled index, while `level=resolve` resolves a representative Mengantar area ID for the selected kecamatan and city.
- [x] **T17** — Shipping Rates API with D1 Origin Fallback (`/api/shipping-rates`).
      -> REQ: REQ-14 · deps: [T15] · Done when: GET `/api/shipping-rates?destination_id=...` resolves origin from D1 `warehouses.origin_area_id` first, env fallback, and returns courier rates from Mengantar `/order/estimate`.
- [x] **T18** — Payment Methods API with COD Province Exclusion (`/api/payment-methods`).
      -> REQ: REQ-15 · deps: [] · Done when: GET `/api/payment-methods?province=...` excludes COD for provinces in `PUBLIC_COD_DISABLED_PROVINCES` list.
- [x] **T19** — Hybrid Checkout Form (`FormHybridContent`).
      -> REQ: REQ-13, REQ-15, REQ-16 · deps: [T16, T17, T18] · Done when: checkout renders kecamatan-only autocomplete without village selection, resolves the destination ID server-side, loads dynamic shipping rates, preserves honest payment availability, and enforces honeypot plus durable submit-token protection.
- [x] **T20** — Middle Funnel Checkout Form (`FormMiddleContent`).
      -> REQ: REQ-16 · deps: [T18] · Done when: middle funnel captures the minimum validated COD order contract, persists through `/api/submit-middle-order`, and uses the same durable submit-token protection as hybrid checkout.
- [x] **T21** — AutoLaris Payment Client (`src/lib/autolaris-client.ts`).
      -> REQ: REQ-11 · deps: [] · Done when: `AutoLarisClient` class supports 10 channel codes (QRIS, VABCA, VAMANDIRI, VABNI, VABRI, VAPERMATA, VABSI, VACIMB, VADANAMON, DANA), `YYYYMMDDHHMMSS` expiry serialization, Bearer auth, timeout, and error propagation.

## Phase 7: Admin Authentication & Security Hardening

- [x] **T22** — PBKDF2-SHA256 Password Hashing & HMAC-SHA256 JWT (`src/lib/auth.ts`).
      -> REQ: REQ-17 · deps: [] · Done when: `signJwt` creates HS256 JWT with `jti`/`iat`/`exp`, `verifyJwt` validates signature and expiry, `verifyPasswordHash` uses PBKDF2-SHA256 with salt, `secureEqual` uses constant-time comparison. AUTH_SECRET minimum 32 chars enforced.
- [x] **T23** — Admin Middleware with KV Session Revocation (`src/middleware.ts`).
      -> REQ: REQ-18, REQ-19 · deps: [T22] · Done when: middleware protects `/admin/*` and `/api/admin/*` with JWT, KV liveness, and D1 credential-revision checks; forces bootstrap users to `/admin/profile`; applies security headers; and blocks cross-origin unsafe mutations.
- [x] **T24** — Admin Login Page & Logout API (`/hello`, `/api/admin/logout`).
      -> REQ: REQ-17, REQ-18 · deps: [T22, T23] · Done when: `/hello` authenticates the D1-backed PBKDF2 credential, sets `cmsads_session`, stores the versioned session in KV, redirects the bootstrap account to profile, and logout deletes the KV session and cookie.
- [x] **T25** — R2 Upload Validation & Security (`/api/admin/upload-r2`).
      -> REQ: REQ-20, REQ-28 · deps: [T23] · Done when: upload endpoint enforces 5 MB limit, MIME + magic-byte check, cryptorandom R2 key, immutable cache-control, and KV-backed hourly quota.

## Phase 8: Admin Dashboard & Analytics

- [x] **T26** — Analytics Dashboard (`AnalyticsDashboard.tsx`, `/api/admin/analytics`).
      -> REQ: REQ-21 · deps: [T23] · Done when: `/admin/dashboard` renders KPI cards (total revenue, total orders, conversion rate, RTS rate) and payment mix breakdown (COD/transfer/QRIS percentages) from D1 aggregate queries.

## Phase 9: Admin Order Management

- [x] **T27** — Order List with Search & Filters (`/admin/orders`, `/api/admin/orders`).
      -> REQ: REQ-22 · deps: [T23] · Done when: `/admin/orders` lists D1 orders with search (invoice/name/phone), payment and shipping status filters, pagination (max 100/page), responsive desktop table and mobile cards.
- [x] **T28** — Order Shipping Status Update (PATCH `/api/admin/orders/[id]`).
      -> REQ: REQ-23 · deps: [T27] · Done when: PATCH updates `shipping_status` without mutating `payment_status`, shows pending/success/error feedback. shadcn/ui Select with semantic color indicators and keyboard navigation.
- [x] **T29** — Invoice Detail Page with Receiver Performance (`/admin/orders/[invoice]`).
      -> REQ: REQ-24, REQ-38 · deps: [T27] · Done when: detail page shows CMS-derived receiver delivery rate/risk and courier totals, customer data, ordered products, shipping/payment information, and inline status updates.
- [x] **T30** — WhatsApp CRM Follow-Up Buttons & Template Engine.
      -> REQ: REQ-25 · deps: [T29] · Done when: responsive 44px-minimum Welcome + Follow-up 1–7 controls render configured templates with `{{nama}}`, `{{wa}}`, `{{alamat}}`, `{{kecamatan}}`, `{{inv}}`, `{{produk}}`, `{{ongkir}}`, `{{total}}`, `{{resi}}`, and `{{kurir}}`, then open a digit-normalized `wa.me` URL.

## Phase 10: Admin Product Catalog

- [x] **T31** — Product Catalog List (`ProductCatalog.tsx`, `/api/admin/products`).
      -> REQ: REQ-26 · deps: [T23] · Done when: `/admin/products` lists products with the canonical D1 product ID, category, variant count, status, and search; product titles link to edit; desktop/mobile action menus expose explicit deletion confirmation.
- [x] **T32** — Product Create, Edit & Protected Deletion (`/admin/products/new`, `/admin/products/edit`, `/api/admin/products`).
      -> REQ: REQ-27 · deps: [T31, T25] · Done when: product + variant inserts/updates are atomic, slug/SKU collisions are rejected, referenced variants and products cannot be deleted, and an unreferenced confirmed deletion removes variants before its product. R2 image upload remains integrated.

## Phase 11: Admin Shipping & Logistics Operations

- [x] **T33** — Shipping Operations Surface (`ShippingOperations.tsx`, `/api/admin/shipping`).
      -> REQ: REQ-29 · deps: [T23, T15] · Done when: `/admin/shipping` renders responsive React surface with D1 shipments, search, status filters, desktop table and mobile cards, loading/error/empty states.
- [x] **T34** — Shipment Status Update & Pickup Scheduling.
      -> REQ: REQ-30 · deps: [T33] · Done when: admin can update shipment status and schedule pickups via `/api/admin/shipping` with pending/success/error feedback.
- [x] **T35** — Courier Enable/Disable & COD Rules (`courier_rules`).
      -> REQ: REQ-31 · deps: [T33] · Done when: admin can toggle courier enabled state and COD support per courier in D1, with rollback on failure.

## Phase 12: Admin Ads & Tracking Configuration

- [x] **T36** — Meta Pixel & CAPI Configuration (`/admin/ads/meta`).
      -> REQ: REQ-32, REQ-34 · deps: [T23, T11] · Done when: Meta Pixel ID and CAPI token displayed with masked secrets, dirty-state detection, save with blank-preserves-existing behavior, server-side test.
- [x] **T37** — Google Ads Conversion Pair (`/admin/ads/google`).
      -> REQ: REQ-33, REQ-34 · deps: [T23] · Done when: Google Ads Conversion ID and Label configured as a validated pair (both present or both absent).

## Phase 13: Admin Settings — Store, Warehouse & CRM

- [x] **T38** — Store & Customer Service Settings (`/admin/settings/store`).
      -> REQ: REQ-35 · deps: [T23] · Done when: store identity and WhatsApp number persisted to D1 `stores` table.
- [x] **T39** — Warehouse Configuration with Kecamatan Lookup (`/admin/settings/warehouse`).
      -> REQ: REQ-36 · deps: [T23, T15] · Done when: warehouse settings show PIC name and normalized phone, group Mengantar results by kecamatan, request kelurahan/desa only after a kecamatan is chosen, and persist the precise origin label plus area ID to D1.
- [x] **T40** — CRM Template Editor (`/admin/settings/crm`).
      -> REQ: REQ-37 · deps: [T23] · Done when: collapsible editors for Welcome + 1–7 provide labeled, 44px insertion controls including phone, address, district, and shipping cost, then persist JSON to `stores.crm_templates`.

## Phase 14: Admin Receiver Performance & Payment Gateway

- [x] **T41** — Receiver Performance Lookup (historical `/admin/scoring`, current `/admin/check`).
      -> REQ: REQ-38 · deps: [T23, T15] · Done when: an admin phone lookup parses Mengantar's actual per-courier history, displays transparent delivery-rate metrics, risk policy, operator guidance, and all courier breakdowns without fabricating a provider score.
- [x] **T42** — Payment Gateway Control Panel (`/admin/payments`).
      -> REQ: REQ-39 · deps: [T23, T21] · Done when: `/admin/payments` separately shows masked API-key and callback-secret readiness, explains each incomplete state and COD impact, displays the runtime callback URL, runs an explicitly local configuration check, and lists the 10 client-supported channels without fabricated merchant account data.

## Phase 15: Admin Navigation & Responsive UX

- [x] **T43** — Grouped Sidebar Navigation (Operational / Growth / System).
      -> REQ: REQ-40 · deps: [T23] · Done when: the desktop sidebar organizes routes into Operational, Growth, and System groups, remains independently scrollable at short viewport heights, and does not narrow the main content pane.
- [x] **T44** — Mobile Admin Drawer & Responsive Tables.
      -> REQ: REQ-40 · deps: [T43] · Done when: below the desktop breakpoint the hamburger opens a scroll-contained modal drawer, closed content is inert, focus is trapped and restored, `Escape` and backdrop activation close it, its footer remains reachable, and admin routes retain 44px controls without horizontal page overflow.

## Phase 16: Full-System Verification

- [x] **T45** — Full-System Typecheck & Build.
      -> REQ: REQ-1..40 · deps: [T1..T44] · Done when: `npm run check` returns 0 errors and `npm run build` succeeds with all admin + storefront routes functional.

## Phase 17: Implementation Completion & Data Integrity

- [x] **T46** — Persist Product Photos from Validated R2 Uploads.
      -> REQ: REQ-28 · deps: [T25, T32] · Done when: product create/edit form uploads a validated image to R2, persists `/assets/uploads/...` in `products.image_url`, reloads it on edit, and displays it in the catalog.
- [x] **T47** — Use Configured CRM Templates in Order Actions.
      -> REQ: REQ-25, REQ-37 · deps: [T30, T40] · Done when: order list and invoice detail load `stores.crm_templates`, fall back safely to defaults, and render Welcome + 1–7 WhatsApp links from the configured text.
- [x] **T48** — Complete Warehouse Origin Schema Migration.
      -> REQ: REQ-14, REQ-36 · deps: [T17, T39] · Done when: Drizzle schema and migration add `warehouses.origin_label`, settings use a typed field, and local migrations report no pending changes.
- [x] **T49** — Remove Fabricated Payment Account State.
      -> REQ: REQ-39 · deps: [T42] · Done when: payment UI derives credential readiness from the protected settings API, derives callback URL from runtime origin, lists supported channel capabilities, and reports connection failures as errors.

## Phase 18: Durable Checkout & Fail-Closed Payment State

- [x] **T50** — Atomic D1 Order Persistence.
      -> REQ: REQ-10 · deps: [T9, T17] · Done when: both checkout endpoints validate an existing variant, derive product value from D1, atomically insert order + item, decrement stock once, return the persisted `order_pk`, and return an error instead of false success on persistence failure.
- [x] **T51** — Durable Submit-Token Idempotency.
      -> REQ: REQ-16 · deps: [T50] · Done when: migration `0003_lyrical_luckman.sql` adds a unique nullable `orders.submit_token` and duplicate requests return `409` across Worker isolates.
- [x] **T52** — Strict Checkout Trust-Boundary Validation.
      -> REQ: REQ-10, REQ-16 · deps: [T50] · Done when: phone validation runs after normalization, quantity is a bounded integer, token is mandatory, variant must exist, stock must suffice, and shipping cost is a bounded non-negative integer.
- [x] **T53** — Fail-Closed Order Status and Webhook Mutations.
      -> REQ: REQ-11, REQ-12 · deps: [T50] · Done when: unknown order status returns `404`, missing D1 returns `503`, and AutoLaris webhook reports missing orders or failed mutations rather than success.
- [x] **T54** — Honest Storefront Payment Availability.
      -> REQ: REQ-15 · deps: [T11, T21] · Done when: unimplemented H2H methods are inactive in `/api/payment-methods`, direct online submissions fail explicitly, and COD-excluded areas show an unavailable message instead of a fabricated online fallback.
- [x] **T55** — Native Contract Test Suite.
      -> REQ: REQ-10, REQ-16, REQ-25 · deps: [T50, T52] · Done when: `npm test` runs Node's built-in test runner and protects phone normalization, order boundaries, province aliases, and CRM rendering without a new dependency.

## Phase 19: Receiver Performance Integrity

- [x] **T56** — Durable Receiver Performance Refresh.
      -> REQ: REQ-38 · deps: [T41, T50] · Done when: both checkout endpoints schedule the Mengantar lookup with Cloudflare `waitUntil()`, persist delivery rate, CMS risk, full courier snapshot, and checked timestamp to D1, while order list/detail/shipping views consume the renamed API contract.

## Phase 20: Pending Provider-Integrated Operations

- [ ] **T57** — Mengantar Shipment Creation and Sequential Queue.
      -> REQ: REQ-41 · deps: [T15, T31, T39] · Done when: a focused admin scenario explicitly releases multiple eligible orders without concurrent `/order` calls, persists each provider-accepted result independently, keeps failures in Order Management, returns per-order results, and never fabricates `cnote_no`.
- [ ] **T58** — Provider-Synchronized Pickup Address and Schedule.
      -> REQ: REQ-42 · deps: [T15, T39, T57] · Done when: admin address/schedule mutations call verified Mengantar `/address` and `/time` contracts and only mark D1 state confirmed after provider success.
- [ ] **T59** — Mengantar Unpaid Shipment Recovery.
      -> REQ: REQ-43 · deps: [T57] · Done when: a real non-COD insufficient-wallet response remains unpaid without a resi and the admin recovery action obtains and persists `cnote_no` after `/order/pay-unpaid` succeeds.
- [ ] **T60** — Verify Official AutoLaris Callback Authentication.
      -> REQ: REQ-44 · deps: [T85] · Done when: the implemented idempotent checkout and reconciliation flow verifies the provider's official callback signature/header contract from canonical documentation; the current configured custom-secret header remains explicit until that contract is available.

## Phase 21: Provider Configuration & Expedition Controls

- [x] **T61** — Editable Provider API Configuration.
      -> REQ: REQ-45 · deps: [T23, T39] · Done when: admin can replace Mengantar and AutoLaris keys/base URLs from `/admin/profile`, values persist in D1 with dashboard-over-environment precedence, GET responses remain masked, and provider consumers use the shared persisted resolver.
- [x] **T62** — Checkout-Enforced Expedition Toggles.
      -> REQ: REQ-46 · deps: [T15, T39] · Done when: `/admin/expeditions` exposes accessible service/COD switches for every courier, mutations persist through a dedicated API, and `/api/shipping-rates` removes service-disabled or COD-disabled couriers from the relevant checkout response.

## Phase 22: Storefront UI/UX Perfection & Design System

- [x] **T63** — Storefront Design System & Token Specification (`STOREFRONT_DESIGN_SYSTEM.md`).
      -> REQ: REQ-2 · deps: [] · Done when: canonical UI/UX tokens, sleek input physics, card padding, and element hierarchies are documented in `STOREFRONT_DESIGN_SYSTEM.md`.
- [x] **T64** — Compact Form Element Physics & Micro-Interactions (`form-hybrid.css`).
      -> REQ: REQ-1, REQ-2 · deps: [T63] · Done when: input height is `2.6rem` (~41.6px), un-typed floating label is centered at `1.3rem`, floated label is thin gray (`0.65rem`, `font-weight: 500`), typed background is `#f0fdf4`, border lines are clean 1px gray `#cbd5e1`, and variant/summary cards use compact padding (`0.65rem 0.85rem` / `0.62rem 0.85rem`).
- [x] **T65** — District Search Dropdown Elevation & Picked Badge Layout (`FormHybridContent.astro`, `form-hybrid.css`).
      -> REQ: REQ-13 · deps: [T64] · Done when: district search dropdown uses `0.55rem 0.85rem` item padding with elevated shadow and soft light green hover tint, selected district badge (`#district-picked`) and status note (`#district-help`) sit cleanly below the search box with `margin-top: 0.55rem`, and redundant top form review headers are removed.

## Phase 23: Kecamatan Search Precision

- [x] **T66** — District-Only Checkout Autocomplete.
      -> REQ: REQ-13 · deps: [T16, T19] · Done when: entering `suko` returns Sukodono, Sukoharjo, Sukodadi, and other matching kecamatan without unrelated districts matched through village names; selecting a row resolves a Mengantar area ID and loads shipping rates without a village step.
- [x] **T67** — Precise Admin Pickup Area Picker.
      -> REQ: REQ-36 · deps: [T39, T66] · Done when: admin warehouse search first displays grouped kecamatan and only then displays available kelurahan/desa before persisting the pickup area ID.

## Phase 24: Cloudflare Deployment-per-Tenant Foundation

- [x] **T68** — Named Tenant Worker Environments.
      -> REQ: REQ-47 · constraints: [REQ-48] · deps: [] · Done when: `wrangler.jsonc` contains a complete `petanisejahtera` environment with independently named Worker and stable isolated binding names, and `CLOUDFLARE_ENV=petanisejahtera npm run build` emits that flattened Worker configuration.
- [x] **T69** — Custom Domain Configuration Validation.
      -> REQ: REQ-49 · deps: [T68] · Done when: tenant validation accepts only exact `custom_domain: true` route objects when production routes are present and rejects wildcard custom-domain patterns.
- [x] **T70** — Tenant-Aware Storefront Shell.
      -> REQ: REQ-50 · deps: [T68] · Done when: typed public tenant configuration controls document language, canonical origin, default SEO description, Open Graph/JSON-LD identity, theme color, and shared header/footer branding while preserving Petani Sejahtera defaults.
- [x] **T71** — Reproducible Local Installer.
      -> REQ: REQ-51 · deps: [] · Done when: `./scripts/install.sh` verifies Node/npm, runs the lockfile-pinned install containing TypeScript and Wrangler, generates binding types, and runs static validation without global installs.
- [x] **T72** — Guarded Tenant Lifecycle Commands.
      -> REQ: REQ-52 · deps: [T68] · Done when: list, validate, dev, build, type-generation, and deployment dry-run commands reject unknown tenant names before launching tools, operate on exactly one tenant, and expose no implicit bulk remote mutation.

## Phase 25: Dashboard-Managed Meta & Google Tracking

- [x] **T73** — Tenant Runtime Tracking Configuration.
      -> REQ: REQ-53 · deps: [T36, T37, T68] · Done when: the Google admin page persists a validated GTM container independently from the Google Ads conversion pair, storefront GTM resolves the tenant's D1 configuration at request time, and Meta secrets remain masked with explicit replacement semantics.
- [x] **T74** — Validated Meta CAPI Ingress & Test Events.
      -> REQ: REQ-54 · deps: [T13, T36] · Done when: unsupported or malformed public CAPI payloads are rejected before outbound fetch, Meta connection tests require and forward a Test Event Code, and outbound requests use a currently supported Graph API version.

## Phase 26: Build-Selected Tenant Content

- [ ] **T75** — Historical Build-Selected Tenant Content Packs (superseded by REQ-63).
      -> REQ: REQ-55 (Superseded by REQ-63) · deps: [T68, T70] · Done when: retained for traceability only. New tenant-content work must target the runtime D1/R2 flow in T96+ rather than reviving build-selected content packs.

## Phase 27: Admin Profile & Credential Rotation

- [x] **T76** — D1-Backed Admin Credential Rotation.
      -> REQ: REQ-17 · deps: [T22, T23, T24] · Done when: migration `0007_flimsy_marvel_apes.sql` creates the documented bootstrap `admin` / `admin` account with forced replacement; `/admin/profile` requires the current password, validates and hashes the replacement, invalidates all credential revisions and KV sessions, then requires login with the new username and password.

## Phase 28: D1-Backed Storefront Catalog

- [x] **T77** — Connect Admin Catalog Operations to Every Storefront Surface.
      -> REQ: REQ-56 · deps: [T31, T32] · Done when: D1 product/variant identity, status, stock, image override, and pricing merge with editorial content by canonical D1 Product ID across home, catalog, detail, campaign checkout, social proof, confirmation, and 404 surfaces; checkout submits the canonical D1 Variant ID; the five-product/ten-variant fixture retains Baja Aussie as a non-public draft until editorial content exists.

## Phase 29: Identifier-Driven Adaptive Checkout Forms

- [x] **T78** — Generate Middle, Full, and Hybrid Forms from Product/Variant IDs.
      -> REQ: REQ-57 · deps: [T77] · Done when: `/api/form-config` accepts a D1 product ID or public slug plus an optional canonical D1 variant ID, rejects inactive/mismatched records, returns canonical URLs for all three form modes, hybrid resolves from trusted geo context, and each existing form route renders the selected D1 price and variant ID without a UI redesign.

## Phase 30: Checkout API Trust Boundary

- [x] **T79** — Revalidate Shipping Quotes Before Order Persistence (retained after REQ-58 supersession).
      -> REQ: REQ-58 (Superseded by REQ-74) · constraints: [REQ-74] · deps: [T77, T78] · Historical and still-required boundary: `/api/shipping-options` derives weight from the selected D1 variant, `/api/submit-order` independently re-fetches eligible rates, a valid quote persists its authoritative cost, and a manipulated quote returns `409 SHIPPING_QUOTE_CHANGED` with no order or stock mutation. This task is not evidence of provider dispatch.
- [x] **T80** — Block Draft Variants and Throttle Order Submission.
      -> REQ: REQ-59 · deps: [T77] · Done when: both order paths reject variants whose product is inactive or whose price/stock is not sellable, enforce the existing per-IP submission limiter before payload processing, and return `429 RATE_LIMITED` after the configured threshold.

## Phase 31: AutoLaris Checkout, Reconciliation, and Recorded Balance

- [x] **T81** — Finish Payment Transaction Persistence and Migration.
      -> REQ: REQ-11 · deps: [T79] · Done when: `orders.customer_email` and `payment_transactions` have a generated, inspected D1 migration; payment attempts persist provider transaction ID, reference, public token, channel, status, amount, admin fee, billed total, VA/QR/code/link, expiry, paid timestamp, failure reason, and timestamps without storing API credentials.
- [x] **T82** — Finish AutoLaris Full/Hybrid Checkout UI.
      -> REQ: REQ-11 · deps: [T81] · Done when: configured AutoLaris channels appear in the full/hybrid form, each option maps to the correct `payment_method` and `payment_channel`, online checkout requires a valid email, COD remains usable without email, and provider-unavailable fallback exposes COD only.
- [x] **T83** — Finish AutoLaris Payment Creation and Customer Instructions.
      -> REQ: REQ-11, REQ-12 · deps: [T81, T82] · Done when: `/api/submit-order` records the D1 order, creates exactly one AutoLaris payment, returns the canonical structured order/payment response, and non-COD checkout opens `/payment` with the actual QRIS, VA, payment code, amount, admin fee, billed total, expiry, provider link, or an honest failure state.
- [x] **T84** — Historical Payment-Gated Automatic Dispatch (superseded by T110).
      -> REQ: REQ-58 (Superseded by REQ-74) · deps: [T83] · Historical boundary: COD dispatched automatically and paid online reconciliation claimed a shipment. The automatic trigger is retired; payment status now determines eligibility only, and explicit operator release is tracked by T110.
- [x] **T85** — Reconcile AutoLaris Callback into Payments and Orders.
      -> REQ: REQ-11 · deps: [T81, T84] · Done when: the authenticated webhook resolves a payment by provider transaction/reference, updates payment and order statuses idempotently, records `paid_at`, and rejects malformed or unauthorized callbacks. Its former automatic Mengantar trigger is superseded by REQ-74 and T110.
- [x] **T86** — Expose Payment Details in Order Management.
      -> REQ: REQ-19 · deps: [T85] · Done when: order detail shows AutoLaris channel, provider transaction, base amount, fee, billed total, payment status, expiry/paid time, and failure reason without exposing secrets.
- [x] **T87** — Build Recorded AutoLaris Balance Page.
      -> REQ: REQ-21 · deps: [T85] · Done when: `/admin/balance` uses the existing admin shell, shows paid recorded funds, pending billed amount, recorded fees, failed count, and a responsive incoming-transfer table linked to orders; the page explicitly labels values as D1 reconciliation rather than live withdrawable AutoLaris balance and contains no unverified withdrawal action.
- [x] **T88** — Add AutoLaris Contract and Ledger Tests (pre-Phase 37 boundary).
      -> REQ: REQ-11 · deps: [T81, T85, T87] · Historical boundary: Node tests covered response parsing, channel mapping, online schema requirements, idempotent paid reconciliation, recorded-balance aggregation, and the then-current payment-gated dispatch. Phase 37 must replace automatic dispatch expectations with paid eligibility plus explicit operator release.
- [x] **T89** — Verify AutoLaris Checkout and Admin Balance Locally (pre-Phase 37 boundary).
      -> REQ: REQ-11 · deps: [T82, T83, T84, T85, T86, T87, T88] · Historical boundary: the local payment/order/admin flow and its former automatic shipment trigger were verified with the checks recorded at the time. This task is not evidence for REQ-74–REQ-76; T113 owns the replacement verification.

## Phase 32: Multi-Worker Tenant Templates and Isolated Admin

- [x] **T90** — Enforce Typed Tenant Template Contract.
      -> REQ: REQ-60 · deps: [T68, T70] · Done when: every tenant environment declares a known content pack, storefront template, and admin identity; unknown values fail `npm run tenant:validate` before Astro or Wrangler executes.
- [x] **T91** — Build Distinct Storefront Home Templates.
      -> REQ: REQ-55 · deps: [T90] · Done when: `/` resolves a registered `compact-market` or `wide-catalog` Astro template at build time, both templates compile against the same D1 catalog contract, and no request-hostname dispatch is introduced.
- [x] **T92** — Brand the Admin Shell per Worker.
      -> REQ: REQ-61 · deps: [T90] · Done when: the admin document title, sidebar identity, logo, and accent derive from the selected tenant configuration while existing admin routes and authorization remain shared.
- [x] **T93** — Prove Per-Worker Provider Replacement Isolation.
      -> REQ: REQ-45 · deps: [T92] · Done when: a local tenant D1 scenario replaces Mengantar and AutoLaris keys/base URLs through the existing authenticated contract, read responses remain masked, and another tenant binding is not read or mutated.
- [x] **T94** — Validate Multi-Worker Domains and Resources.
      -> REQ: REQ-62 · deps: [T90] · Done when: validation rejects duplicate domains/resources and a `PUBLIC_SITE_URL` that does not match an exact custom domain, while both committed environments validate and build without remote mutation.

## Phase 33: Operational Checker Features

- [x] **T95** — Implement "Cek Ongkir" & "Cek WA" Admin Tool.
      -> REQ: REQ-68 · constraints: [REQ-13, REQ-14, REQ-38] · deps: [T56, T67] · Done when: `/admin/check` combines receiver scoring with tenant-scoped shipping estimation; origin is locked to warehouse configuration; destination uses the supported area-resolution flow; and the prior `/admin/scoring` route is removed.

## Phase 34: Runtime AI Content and Fleet Delivery

- [x] **T96** — Add Tenant Runtime Content Persistence.
      -> REQ: REQ-63 · deps: [T90] · Done when: D1 stores tenant-scoped AI instructions plus validated draft/published content records, contains no seeded tenant instruction, and generated migrations apply independently to both local tenant databases.
- [x] **T97** — Generate and Publish Typed AI Drafts.
      -> REQ: REQ-64 · deps: [T96] · Done when: an authenticated Worker-scoped API saves instructions, generates or accepts schema-valid home/product drafts, never auto-publishes, and explicit publication cannot modify operational product/provider/order fields.
- [x] **T98** — Render Published Runtime Content First.
      -> REQ: REQ-63 · deps: [T96, T97] · Done when: home and product renderers prefer published content from the active Worker's D1, ignore drafts, retain D1 price/stock/provider identity as authoritative, and safely preserve the existing storefront during the migration window.
- [x] **T99** — Verify Operations-Only Admin and Order Ingestion.
      -> REQ: REQ-65 · deps: [T50, T92] · Done when: product IDs, Meta/Google, Mengantar/AutoLaris, warehouse/courier, and order lifecycle remain admin-owned; both public submit endpoints use shared atomic D1 persistence and their orders appear through admin APIs.
- [x] **T100** — Add Failure-Isolated Fleet Release Matrix.
      -> REQ: REQ-66 · deps: [T94] · Done when: CI derives every tenant from validated configuration, validates once, dry-runs pull requests, deploys the same revision to each Worker with `fail-fast: false`, retains per-tenant concurrency and secrets, and never applies remote D1 migrations automatically.
- [x] **T101** — Verify Runtime Content and Fleet Contracts Locally.
      -> REQ: REQ-67 · deps: [T96, T97, T98, T99, T100] · Done when: contract tests reject invalid keys, raw HTML, operational AI fields, and publish-without-draft; local D1 proves draft versus published behavior; `npm test`, `npm run check`, tenant validation, workflow syntax, and both tenant builds pass without remote mutation.
- [ ] **T102** — Remove Compiled Tenant Content Fallback.
      -> REQ: REQ-63 · deps: [T101] · Done when: every active public route in every deployed tenant has reviewed published D1 content and tenant-owned R2 media, a preflight proves runtime completeness, and the legacy Petani Sejahtera content source is deleted from Git without blanking a storefront.

## Phase 35: Runtime Content Operator Surface

- [x] **T103** — Build Tenant Runtime Content Workbench.
      -> REQ: REQ-69 · constraints: [REQ-61, REQ-63, REQ-64, REQ-67] · deps: [T97, T98] · Done when: a committed `/admin/content` surface lists tenant content keys and draft/published status from `/api/admin/content`, saves instructions without echoing them, supports manual draft save plus Workers AI generation plus explicit publish and R2 media upload, and works at desktop and 390px without leaking cross-tenant data.

## Phase 36: Merchant Provisioning and Delegated Content Operations

- [x] **T104** — Build Guarded Cloudflare Tenant Installer.
      -> REQ: REQ-70 · deps: [T90, T94] · Done when: `tenant:install` validates a no-side-effect plan, rejects registry/resource overlap, provisions isolated Worker/D1/KV/R2/AI configuration only with `--yes`, bootstraps a named owner, and deploys only with explicit `--publish`.
- [x] **T105** — Add Owner and Content Collaborator Roles.
      -> REQ: REQ-71 · deps: [T92] · Done when: an owner can create/revoke named collaborators; collaborator sessions expose only content/media/profile routes; and owner-only pages/APIs fail closed.
- [x] **T106** — Enforce Runtime-Only Storefront Content.
      -> REQ: REQ-72 · deps: [T96, T103] · Done when: missing home content renders an honest setup state, products without published D1 content are omitted, and no public runtime path falls back to compiled merchant copy.
- [x] **T107** — Make Fleet Releases Explicit per Tenant.
      -> REQ: REQ-66 · deps: [T100, T104] · Done when: pull requests validate/dry-run all tenants, pushes to `main` do not deploy, and manual dispatch requires one exact tenant slug.
- [x] **T108** — Historical Middle-Order Shipping Selection (superseded by Phase 37).
      -> REQ: REQ-73 (Superseded by REQ-74) · deps: [T57, T85] · Historical boundary: middle-form orders were routed into shipping selection, but the middle-only rule did not establish the canonical lifecycle for every checkout path and is not evidence that Phase 37 is complete.
- [x] **T109** — Verify Provisioning, Roles, Content, and Media Locally.
      -> REQ: REQ-67, REQ-69, REQ-70, REQ-71, REQ-72 · deps: [T103, T104, T105, T106, T107] · Done when: installer contract tests prove no-side-effect planning and approval gates; browser checks prove owner/collaborator isolation, D1 draft/publish, R2 upload/serve, and 390px layout; static checks, tests, tenant validation, and both tenant builds pass.

## Phase 37: Confirmed Shipping Queue and Explicit Mengantar Push — Complete Locally

Implementation, contract tests, static checks, build, and focused authenticated desktop/mobile browser scenarios passed on 2026-08-11. Live provider mutation, remote migration, and deployment remain operator-gated.

- [x] **T110** — Keep Every New Order Pending Until Operator Confirmation.
      -> REQ: REQ-74 · deps: [T50, T79, T85] · Done when: both checkout paths persist without calling Mengantar, every order starts in Order Management, and confirmation—not payment or checkout—moves a verified order to `processing` in Shipping.
- [x] **T111** — Add Searchable Optional-Precision Order Destination Editing.
      -> REQ: REQ-75 · deps: [T27, T66, T67] · Done when: the order editor searches district or city terms, defaults to one real Mengantar area per grouped district, optionally exposes precise kelurahan/desa results, persists the selected provider identity and human-readable location, re-quotes actual public courier prices, and blocks confirmation while destination or courier data is incomplete.
- [x] **T112** — Add Explicit Eligible Single/Bulk Mengantar Push in Shipping.
      -> REQ: REQ-41 · constraints: [REQ-74, REQ-76] · deps: [T57, T110, T111] · Done when: Shipping exposes per-row Push plus bulk checklists, eligibility is server-derived, eligible calls execute sequentially, and the response reports independent success/unpaid/skipped/failed outcomes.
- [x] **T113** — Verify Confirmation, Retry, and Waybill Semantics.
      -> REQ: REQ-76 · constraints: [REQ-43] · deps: [T112] · Done when: a focused scenario proves confirmation moves an order into Shipping without provider mutation, failed dispatch remains `processing` and retryable, provider identity is accepted only from provider output, and absent `cnote_no` is never fabricated.

## Phase 38: Petani Sejahtera Preview Catalog — Deployed

- [x] **T114** — Import the Selected Product Catalog into Preview D1.
      -> REQ: REQ-70, REQ-71, REQ-72 · deps: [T103, T105, T106] · Done when: Aussie, Bensu, Saratoga, and Kojien are active with 500ml and 1 Liter variants, source-backed prices and copy, and published runtime content without a compiled storefront fallback.
- [x] **T115** — Refine Catalog and Product Presentation.
      -> REQ: REQ-72 · deps: [T114] · Done when: catalog cards disclose the starting-price basis and variant count, product pages expose both variant prices and SKUs, shipping guidance is factual, and no countdown or fabricated scarcity message appears.
- [x] **T116** — Verify and Release the Preview Catalog.
      -> REQ: REQ-66 · deps: [T114, T115] · Done when: tests, static checks, build, tenant dry-run, remote D1 verification, guarded preview deployment, and desktop/mobile live browser checks pass without changing the production domain or invoking Mengantar.

## Phase 39: Mobile-First Petani Sejahtera Storefront — Deployed

- [x] **T117** — Lock the Preview Storefront to the Mobile Web-App Shell.
      -> REQ: REQ-72 · deps: [T115] · Done when: the preview uses the compact storefront, remains fluid below 480px, and stays centered at exactly 480px on wider viewports without desktop-only internal layouts.
- [x] **T118** — Adapt Home, Catalog, and Product Presentation.
      -> REQ: REQ-72 · deps: [T114, T117] · Done when: the visual hierarchy follows the standalone Petani Sejahtera storefront, preserves runtime D1 content, exposes product variants and prices, and keeps every product route touch-accessible.
- [x] **T119** — Preserve and Verify the Existing Checkout Form.
      -> REQ: REQ-11, REQ-72 · deps: [T118] · Done when: product pages retain the current CMSAds form fields, validation, selectors, and interaction flow; mobile controls remain at least 16px; local and live browser checks pass at 390px, 480px, and a wide viewport.


## Phase 40: Mobile Checkout Field Polish — Deployed

- [x] **T120** — Use Compact Shopify-Style Floating Labels.
      -> REQ: REQ-11, REQ-72 · deps: [T119] · Done when: both middle and full checkout modes show a single-line control whose label sits inside at rest and shrinks above the value on focus/fill, with 16px text, compact height, and no change to field IDs, names, or validation contracts.
- [x] **T121** — Establish Accessible Field and Summary States.
      -> REQ: REQ-11 · deps: [T120] · Done when: neutral, focus, valid, and invalid states are visually distinct; the recipient group, variants, payment choice, and summary share one restrained surface hierarchy.
- [x] **T122** — Verify Checkout Polish Locally.
      -> REQ: REQ-11, REQ-72 · deps: [T120, T121] · Done when: static validation and build pass; 390px middle/full form checks cover focus, error feedback, district selection, and overflow; the 1280px shell remains 480px wide.
- [x] **T123** — Release and Smoke Test the Preview Form.
      -> REQ: REQ-66, REQ-72 · deps: [T122] · Done when: guarded preview deployment succeeds and live 390px middle/full checks confirm the new surfaces, 16px/52px controls, district lookup, zero overflow, and clean console/network results without submitting an order.
- [x] **T124** — Compact the Selected-District Chip.
      -> REQ: REQ-11, REQ-75 · deps: [T111, T120] · Done when: the confirmed kecamatan renders as one precise, minimal line block (small title, truncated subtitle, small `Ubah` link) without a tall card, and the `Ubah` reset flow still works.
- [x] **T125** — Shrink and Group Payment Methods.
      -> REQ: REQ-11 · deps: [T121] · Done when: payment rows are compact but clear; COD and QRIS stay top-level; all bank/Virtual Account channels collapse into one accordion that shows the bank count when closed and the selected bank when chosen, auto-expands on bank selection, fills only the chosen bank's radio, and collapses when COD/QRIS is selected — with no change to payment field names, hidden inputs, validation, or submission contracts.
- [x] **T126** — Verify and Release District/Payment Polish.
      -> REQ: REQ-66, REQ-11 · deps: [T124, T125] · Done when: static validation, tests, and build pass; 390px checks prove the compact chip, grouped payment expand/collapse, and single-selection behavior with zero overflow; guarded preview deployment succeeds and the live full form renders the grouped payment UI without console/network errors and without submitting an order.

## Phase 41: Remove Checkout Email Field — Deployed

- [x] **T127** — Remove the Customer Email Input Without Breaking Online Payment.
      -> REQ: REQ-11 · deps: [T119] · Done when: the checkout form no longer shows or requires an email, submit readiness no longer gates on email, online (non-COD) orders still receive a valid synthesized email server-side for AutoLaris, COD stays email-null, tests/checks/build pass, and a live preview smoke reaches the ready state for COD and Virtual Account without an email field or console/network errors.

## Phase 42: City/District Search, Normal-Price Summary, and Actual Shipping — Deployed

- [x] **T128** — Match Location Search by City or District.
      -> REQ: REQ-75 · deps: [T111, T124] · Done when: the full-form search returns kecamatan for both a district query and a city query (district-first ranking), a city search lets the buyer pick a kecamatan that resolves to the real Mengantar area id, and copy reads "kecamatan atau kota"; a catalog test covers district and city lookups.
- [x] **T129** — Label the Summary Strikethrough as "Harga Normal".
      -> REQ: REQ-11 · deps: [T121] · Done when: both full and middle summary cards label the strikethrough row "Harga Normal", the after-discount price remains the valid total, and no id/value changes.
- [x] **T130** — Quote the Actual Courier Shipping Cost.
      -> REQ: REQ-43, REQ-75 · deps: [T57] · Done when: `estimateRates` returns the actual courier `price` (falling back to the special price only when missing), and the client summary plus server-side re-quote stay consistent.
- [x] **T131** — Verify and Release the Checkout Improvements.
      -> REQ: REQ-66 · deps: [T128, T129, T130] · Done when: tests/checks/build pass and a live preview smoke proves city search, the "Harga Normal" label, kecamatan resolution, actual shipping, and a correct after-discount total without submitting an order.

## Phase 43: Responsive Admin Commerce Workspace — Deployed to Preview

- [x] **T132** — Establish One Responsive Admin Navigation Contract.
      -> REQ: REQ-40, REQ-50, REQ-61 · deps: [T87] · Done when: desktop sidebar, command search, mobile app bar, and all-menu sheet consume one route definition; tenant identity and active-route state stay consistent; all controls remain keyboard-operable.
- [x] **T133** — Recompose Dashboard and Core Operations Surfaces.
      -> REQ: REQ-21, REQ-22, REQ-29 · deps: [T132] · Done when: Dashboard, Order Management, Shipping, Product, and Content use the shared page hierarchy, compact KPI/filter patterns, responsive desktop/mobile layouts, and existing APIs without changing business contracts.
- [x] **T134** — Standardize Admin Configuration and Feedback Surfaces.
      -> REQ: REQ-31, REQ-32, REQ-33, REQ-35, REQ-36, REQ-37, REQ-39, REQ-46 · deps: [T132] · Done when: Ads, payments, expeditions, settings, profile, access, warehouse, and CRM routes use consistent headers, loading/error/status regions, form controls, and navigation back paths.
- [x] **T135** — Repair the Desktop Order Data Grid.
      -> REQ: REQ-22, REQ-25, REQ-41 · deps: [T133] · Done when: every desktop row has one cell per header, dispatch eligibility feedback sits with the invoice instead of the checkbox, timestamps render in WIB, CRM controls align under their own column, and bulk/order actions remain reachable.
- [x] **T136** — Verify the Complete Admin Workspace.
      -> REQ: REQ-18, REQ-40 · deps: [T132, T133, T134, T135] · Done when: tests, static checks, and the Cloudflare build pass; every static admin route plus real product-edit and order-detail routes returns HTTP 200; 1440px and 390px browser flows prove the shell, app menu, filters, tables/cards, and route navigation without page-level horizontal overflow.
- [x] **T137** — Release and Smoke Test the Preview Admin Build.
      -> REQ: REQ-18, REQ-40, REQ-66 · deps: [T136] · Done when: guarded tenant deployment publishes only `petanisejahtera-preview`; live storefront/product routes return HTTP 200 at 390px without horizontal overflow; unauthenticated admin navigation reaches the branded login; and the protected orders API returns HTTP 401 without mutating D1 or calling live providers.

## Phase 44: Precise Admin Date Filters — Deployed to Preview

- [x] **T138** — Unify Admin Date Presets and Defaults.
      -> REQ: REQ-21, REQ-22, REQ-29, REQ-77 · deps: [T133] · Done when: Dashboard, Order Management, and Shipping use one labelled preset contract, list `Semua waktu` first, default to it, and render sentence-case Indonesian labels instead of raw internal values.
- [x] **T139** — Correct Filter Boundaries, Search, and Reset Behavior.
      -> REQ: REQ-22, REQ-29, REQ-77 · deps: [T138] · Done when: seven/30-day windows contain exactly 7/30 inclusive Jakarta dates; Orders and Shipping apply the same server range; order search genuinely matches the advertised resi field; every Reset clears the period; custom analytics ranges reject invalid or over-31-day input.
- [x] **T140** — Verify Responsive Filter Workflows.
      -> REQ: REQ-40, REQ-77 · deps: [T138, T139] · Done when: tests/check/build pass; authenticated desktop and 390px browser flows exercise all-time, yesterday, seven-day, custom, search, empty, and reset states without horizontal overflow.
 
## Phase 45: Order Workflow, Editor, and Command Search Refinement — Historical, Dispatch Flow Superseded by T199

- [x] **T141** — Route Confirmation into the Shipping Queue (Superseded by T199).
      -> REQ: REQ-74, REQ-76 · deps: [T110] · Historical result: implemented a local `confirm-shipping` transition. T199 removed that transition so only provider acceptance can expose an order in Shipping.
- [x] **T142** — Place Single and Bulk Provider Push in Shipping (Superseded by T199).
      -> REQ: REQ-41, REQ-76 · deps: [T112, T141] · Historical result: implemented sequential provider Push controls in Shipping. T199 moved them to Order Management and retained per-order outcomes.
- [x] **T143** — Refine the Order Destination and Courier Editor.
      -> REQ: REQ-75 · deps: [T111, T130] · Done when: the editor has grouped customer/address/destination sections, city-or-district search resolves subdistrict choices, deep-linked Shipping edits open automatically, and actual public prices render without duplicate courier or day labels.
- [x] **T144** — Rebuild Responsive Admin Command Search.
      -> REQ: REQ-40 · deps: [T132] · Done when: desktop and mobile triggers plus `Ctrl/Cmd+K` open one full command palette, normalization tolerates Indonesian text, route label/description/group/keyword search returns the correct item, and Enter navigates.
- [x] **T145** — Verify the Refined Order Workflow Locally (Historical proof superseded by T199).
      -> REQ: REQ-40, REQ-41, REQ-74, REQ-75, REQ-76 · deps: [T141, T142, T143, T144] · Historical result: verified the then-current local-confirmation flow, location editor, and command search. T199 supplies the current provider-accepted-only workflow proof.

## Phase 46: Canonical Multi-Tenant Admin and Workflow Release — Deployed to Preview

- [x] **T146** — Separate the Canonical Admin System from Storefront Presentation.
      -> REQ: REQ-40, REQ-50, REQ-61 · deps: [T132, T145] · Done when: every tenant build consumes the same admin navigation, ADScms visual tokens, responsive behavior, lifecycle, and operator components while storefront template/theme/content remain tenant-selectable.
- [x] **T147** — Release and Smoke Test the Refined Preview Admin.
      -> REQ: REQ-41, REQ-66, REQ-74, REQ-75, REQ-76 · deps: [T145, T146] · Done when: tests, static checks, tenant validation/build/dry-run pass; the guarded preview deployment succeeds; live storefront and unauthenticated admin/API checks pass without a production-domain, remote-D1, or live-provider mutation.

## Phase 47: Canonical Admin Density and Login Background — Deployed to Preview

- [x] **T148** — Refine Canonical Admin Density and Search Placement.
      -> REQ: REQ-40, REQ-78 · deps: [T146] · Done when: every static admin workspace plus real order/product detail routes uses the compact shared hierarchy; desktop search is viewport-centered, mobile search is a full-width bottom sheet, the mobile all-menu remains scrollable, and no audited route has page-level horizontal overflow.
- [x] **T149** — Add the Fixed Responsive Admin Login Background.
      -> REQ: REQ-40, REQ-78 · deps: [T148] · Done when: the Mac-provided `ferioyes.png` is converted to the repository-owned `admin-login.webp`, the canonical login uses it behind a readable fixed credential card, 320px through 2560px viewports fit without horizontal or vertical overflow, and mobile inputs remain 16px.
- [x] **T150** — Validate and Release the Refined Preview Admin.
      -> REQ: REQ-18, REQ-40, REQ-66, REQ-78 · deps: [T148, T149] · Done when: tests, static checks, preview tenant build/dry-run, authenticated local route screening, guarded preview deployment, live storefront/login/API smoke, and desktop/mobile visual checks pass without remote D1 or live-provider mutation.

## Phase 48: Mobile Search Sheet and Session Exit — Deployed to Preview

- [x] **T151** — Replace Mobile Search Dialog with a Bottom Sheet.
      -> REQ: REQ-40, REQ-78 · deps: [T148] · Done when: the mobile search icon opens a bounded, bottom-anchored Sheet with focused 16px command input and scrollable results; `pengiriman` resolves to one Shipping route and Enter navigates; desktop `Ctrl/Cmd+K` remains a centered dialog.
- [x] **T152** — Add and Verify Mobile All-Menu Logout.
      -> REQ: REQ-18, REQ-40, REQ-78 · deps: [T151] · Done when: the all-menu shows a visible 44px-or-taller `Keluar` row, submits the existing POST logout contract, invalidates the active session, redirects to `/hello`, and tests/checks/tenant validation/build/dry-run plus guarded preview release pass without changing storefront presentation or another tenant.

## Phase 49: Precise Mobile Bulk Selection — Deployed to Preview

- [x] **T153** — Normalize Order and Shipping Mobile Density.
      -> REQ: REQ-40, REQ-78, REQ-79 · deps: [T148] · Done when: Order Management and Shipping filters use two aligned mobile columns, cards align to the shared workspace gutter, action controls remain at least 44px, and neither page has horizontal overflow at 390px.
- [x] **T154** — Add Filter-Aware Bulk Selection Navigation.
      -> REQ: REQ-41, REQ-79 · deps: [T141, T153] · Done when: selection starts empty; separate master controls select/deselect every visible push or pickup row; partial selection is indeterminate; selected cards, live counts, clear-selection, and explicit Push/Pickup actions remain visible in a sticky mobile toolbar; desktop exposes an equivalent master checkbox.
- [x] **T155** — Verify Bulk Selection without Provider Mutation.
      -> REQ: REQ-18, REQ-41, REQ-79 · deps: [T154] · Done when: tests/checks/tenant validation/build/dry-run pass, browser QA proves zero/partial/all/clear states and sticky behavior at 390×844, and no Push or Pickup mutation is submitted during verification.
- [x] **T156** — Add the AI-Agent Cloudflare Deployment Runbook.
      -> REQ: REQ-18, REQ-66 · deps: [T147] · Done when: repository docs require one exact tenant, local release gates, separately approved deployment and migration commands, wrapper-only release, selected-host smoke checks, fail-closed behavior, and evidence/non-action reporting.
- [x] **T157** — Release and Smoke Test Mobile Bulk Selection.
      -> REQ: REQ-18, REQ-79 · deps: [T155, T156] · Done when: the scoped commit is pushed, the guarded wrapper deploys only `petanisejahtera-preview`, and selected-host storefront/login/API smoke passes without remote D1, provider, pickup, or order mutation.

## Phase 50: Indonesian Visual System Guide — Complete Locally

- [x] **T158** — Build the Multi-Page Visual System Guide.
      -> REQ: REQ-80 · deps: [T156] · Done when: `doc/preview` contains one responsive shared shell plus Indonesian overview, architecture/data, admin operations, order/shipping, tenant/Cloudflare, and setup/release pages using Tailwind Play CDN and repository-local CSS/JavaScript.
- [x] **T159** — Verify Visual Guide Structure and Responsive Navigation.
      -> REQ: REQ-78, REQ-80 · deps: [T158] · Done when: all local references and section anchors resolve, six pages render at 1440×1000 and 390×844 with the correct active navigation and zero page-level horizontal overflow, mobile navigation opens and changes pages, and browser QA reports no console error or failed request.

## Phase 51: a retired tenant Storefront Integrity — Complete Locally

- [x] **T160** — Remove Synthetic Storefront Trust and Discount Signals.
      -> REQ: REQ-64, REQ-81 · deps: [T135] · Done when: product pages no longer synthesize ratings, review/sales counts, bestseller badges, guarantees, or comparison discounts; structured data includes ratings/reviews only when evidence-backed content supplies them; and no-discount variants hide comparison rows after selection.
- [x] **T161** — Align the Wide-Catalog Tenant Shell.
      -> REQ: REQ-50, REQ-72, REQ-82 · deps: [T160] · Done when: a retired tenant product detail, shared header/footer, legal links, theme color, metadata image, and product-image semantics match the `wide-catalog` tenant at desktop and 320–390px mobile widths without horizontal overflow or another merchant's copy.
- [x] **T162** — Ground AI Homepage Generation in D1 Facts.
      -> REQ: REQ-63, REQ-64, REQ-67, REQ-81 · deps: [T160] · Done when: homepage generation receives active product and variant facts through one D1 batch, fabricated asset paths are prohibited, and AI-created testimonial/review arrays remain empty pending evidence-backed manual entry.
- [x] **T163** — Validate and Record a retired tenant Audit.
      -> REQ: REQ-18, REQ-66, REQ-81, REQ-82 · deps: [T160, T161, T162] · Done when: tests, Astro/TypeScript checks, tenant validation, a retired tenant build/dry-run, local fixture storefront/browser QA, default-gated admin login, legal-route checks, and no-provider-mutation reporting pass before the scoped commit.

## Phase 52: Canonical Documentation and AI-Agent Operations — Complete Locally

- [x] **T164** — Reconcile the Canonical Documentation Pack.
      -> REQ: REQ-63, REQ-66, REQ-74, REQ-76, REQ-80, REQ-81, REQ-82 · deps: [T159, T163] · Done when: README, AGENTS, PLAN, PRD, STATUS, remaining-work ledger, Cloudflare runbook, Mengantar specification, and storefront design contract agree on current ownership, runtime content, order/shipping lifecycle, tenant roster, evidence boundaries, and genuine blockers without stale pending-Main claims or absolute workstation paths.
- [x] **T165** — Audit and Remove the Orphan a retired tenant Worker.
      -> REQ: REQ-62, REQ-66, REQ-83 · deps: [T163] · Done when: account-wide inventory proves `deleted-orphan-worker` has no Custom Domain, zone route, or enabled workers.dev endpoint; exact deletion is approved; only that Worker is deleted; canonical `retired-backend-worker`, `retired-tenant.example`, and shared D1/KV/R2 remain; and the hostname still responds.
- [x] **T166** — Add and Verify the Visual AI-Agent Runbook.
      -> REQ: REQ-66, REQ-80, REQ-83 · deps: [T164, T165] · Done when: `doc/preview/ai-agent.html` covers source selection, task flow, validation, approval gates, release, orphan cleanup, and handoff; every visual-guide page shares the seven-page navigation; all Markdown/HTML links and fragments resolve; portable-path and duplicate-ID audits pass; and desktop/mobile browser QA reports correct navigation with no console error, failed request, or page-level horizontal overflow.

## Phase 53: a retired tenant Headless Storefront Boundary — Deployed

- [x] **T167** — Restore the Standalone a retired tenant Storefront.
      -> REQ: REQ-84 · deps: [T165] · Done when: the GitHub-tracked standalone Astro storefront owns `retired-tenant.example/*`, public home and product pages render the original frontend at mobile and desktop widths, and no CMSAds setup state replaces it.
- [x] **T168** — Add the Private CMSAds Gateway Boundary.
      -> REQ: REQ-49, REQ-62, REQ-84 · deps: [T167] · Done when: the storefront Worker serves static paths, forwards `/admin`, `/api`, `/hello`, `/payment`, `/thanks`, and canonical checkout routes through a `CMSADS` service binding, and routing tests prevent accidental public-path delegation.
- [x] **T169** — Make a retired tenant Backend Service-Only.
      -> REQ: REQ-49, REQ-52, REQ-62, REQ-66, REQ-84 · deps: [T168] · Done when: the CMSAds registry declares a retired tenant service-only with no public route, validation rejects both ingress-mode inversions, both tenant dry-runs pass, deployment reports no CMSAds target, and live delegated login/API checks still pass.
- [x] **T170** — Reconcile and Verify the Headless Architecture.
      -> REQ: REQ-66, REQ-84 · deps: [T169] · Done when: README, PRD, TASKS, STATUS, build log, and Cloudflare runbook agree on route/data ownership; standalone tests/check/build/dry-run and CMSAds tests/check/registry/dry-runs pass; and live mobile/desktop smoke records concrete results.

## Phase 54: Portable New-Account Installation Proof — Planned

- [ ] **T171** — Prove the Portable Local Installer Boundary.
      -> REQ: REQ-85 · deps: [] · Done when: a clean supported workstation runs `./scripts/install.sh` with the default and one explicit registered profile, records the expected lockfile/registry/type/static-check results, and records that no Cloudflare authentication, resource creation, remote migration, deployment, DNS/secret change, or data import occurred.
- [ ] **T172** — Prove Immutable-Sample Provisioning in a New Account.
      -> REQ: REQ-87, REQ-98 · deps: [T171] · Done when: an explicitly approved test tenant plan reports unique D1/KV/R2/AI resources, `runtime-managed`, the canonical immutable sample, and `importsExistingTenantData: false`; approved provisioning creates schema, one store row, one forced-rotation owner, product `10001`, and variants `20001`/`20002`; repository queries prove no sibling merchant products, content, media, customers, orders, payments, provider config, tracking credentials, sessions, or secrets were copied.
- [ ] **T173** — Exercise Both Ingress Topologies.
      -> REQ: REQ-88 · deps: [T172] · Done when: an integrated test tenant proves an exact CMSAds Custom Domain, a headless test tenant proves no CMSAds public route plus one reviewed storefront service binding, and independent dry-run/smoke evidence distinguishes each Worker and every non-action.

## Phase 55: Headless Public Data, Locked Forms, and Tracking Adapters — Planned

- [ ] **T174** — Implement the Public Non-Secret Storefront Bootstrap.
      -> REQ: REQ-92 · deps: [T173] · Done when: a documented public read endpoint returns only reviewed tenant identity and browser tracking fields, rejects cross-tenant resolution, never serializes CAPI/provider/session/customer/payment secrets, and contract tests cover configured, unconfigured, and malformed requests.
- [ ] **T175** — Implement the Canonical Public Catalog Contract.
      -> REQ: REQ-93 · deps: [T174] · Done when: public product/list reads expose only active canonical products and variants with D1 identity, presentation, price, availability, weight, and media; inactive/unknown/cross-tenant inputs fail closed; a headless storefront renders from the contract without maintaining a second product identity.
- [ ] **T176** — Prove Canonical Form Delegation in a Selected Headless Gateway.
      -> REQ: REQ-94, REQ-96 · deps: [T174, T175] · Done when: the selected headless gateway delegates `/hybrid-form`, `/middle-form`, and `/full-form` through its private CMSAds binding, rejects legacy `/form-*` aliases, routing tests prove public storefront paths remain local, and mobile/desktop flows preserve product, variant, campaign, click, event, source, and error/focus context without duplicating form markup.
- [ ] **T177** — Publish a Framework-Neutral Executable Storefront Adapter.
      -> REQ: REQ-94, REQ-100 · deps: [T176] · Done when: the smallest reusable adapter or reference implementation covers bootstrap, catalog, form handoff, order confirmation, error mapping, attribution identity, and accessible focus return, and executable contract scenarios pass for every declared supported frontend. The reusable documentation prompt alone does not complete this task.
- [ ] **T178** — Complete the Meta Browser/CAPI Storefront Adapter.
      -> REQ: REQ-91 · deps: [T174, T177] · Done when: PageView/ViewContent/AddToCart/InitiateCheckout/Purchase use canonical D1 `content_ids`, approved `_fbp`/`_fbc` and click identifiers are preserved, CAPI secrets remain server-only, COD versus paid Purchase gates are proven, and browser/server Purchase share one dedicated event ID without refresh duplication.
- [ ] **T179** — Implement Consent-Aware Cross-Storefront Tracking.
      -> REQ: REQ-95 · deps: [T178] · Done when: optional tags and events obey the selected tenant's reviewed consent rule, consent context survives the locked-form handoff, checkout remains usable when tracking is declined or unavailable, and browser emission, CMSAds acceptance, Meta acceptance, attribution, and reporting are displayed and tested as separate states.

## Phase 56: Canonical Forms, Province Policy, Sample, Sidebar, and Handoff — Complete Locally

- [x] **T180** — Maintain Canonical Form Routes with Legacy Link Compatibility.
      -> REQ: REQ-94, REQ-96 · deps: [] · Done when: local requests render `/hybrid-form`, `/middle-form`, and `/full-form`; `/form-hybrid`, `/form-middle`, and `/form-full` permanently redirect to their corresponding renderer with the full query string preserved; known eligible province resolves middle; and COD-disabled or unknown/unresolved province resolves full.
- [x] **T181** — Persist and Enforce the Tenant Province Policy.
      -> REQ: REQ-97 · deps: [T180] · Done when: `cod_disabled_province_codes` is store-scoped and distinct from courier exclusions, the admin renders all 38 recognized provinces with the observed tenant policy selecting 15, and server form/payment behavior rejects disabled COD consistently.
- [x] **T182** — Install and Protect the Canonical Sample.
      -> REQ: REQ-87, REQ-98 · deps: [] · Done when: local migration `0017` succeeds; product `10001` (`aussie`, `Aussie Sample`) and variants `20001` (`500ml`, Rp150,000, `600g`) and `20002` (`1 Liter`, Rp300,000, `1100g`) are present; installer verification preserves exact IDs/values; and admin/API mutation attempts return `409`.
- [x] **T183** — Make the Admin Sidebar Accordion Accessible and Short-Viewport Safe.
      -> REQ: REQ-99 · deps: [] · Done when: desktop browser proof shows the active section opens, opening another section closes the first, accessible expanded state follows the visible state, and the navigation scrolls independently in a short viewport.
- [x] **T184** — Publish the Reusable Storefront Implementation Prompt.
      -> REQ: REQ-100 · deps: [T180, T181] · Done when: `STOREFRONT_INTEGRATION.md` contains the framework/domain/Worker/account-neutral prompt, canonical routes and fail-closed province policy, service-only isolation, no-animation boundary, explicit remote-approval gates, and the rule that absent public bootstrap/catalog APIs block catalog implementation instead of permitting fake static data.
- [ ] **T185** — Prove New-Account Provisioning and Remote Release.
      -> REQ: REQ-86, REQ-87, REQ-88, REQ-98 · deps: [T171, T172, T173] · Done when: exact-tenant approval is recorded; isolated remote resources, migration, canonical sample, owner bootstrap, ingress topology, and no imported sibling data are proved; deployment is separately approved and observed; and provider acceptance remains separately evidenced.

## Phase 57: AutoLaris Payment Confirmation Boundary — Complete Locally

- [x] **T186** — Render QRIS and Gate the Success Receipt.
      -> REQ: REQ-11, REQ-12, REQ-84 · deps: [T83, T168] · Done when: online checkout routes to `/payment`; a recorded QRIS payload renders as a scannable QR; pending, failed, and expired states do not show a successful receipt; token-authorized polling redirects paid orders to `/thanks`; the paid receipt omits raw QR payload; Permata gateway tests include `/payment`; CMSAds tests/check/build and mobile/desktop browser proof pass without creating an order or calling a provider.

## Phase 58: Checkout Price, Destination, and Payment Precision — Complete Locally

- [x] **T187** — Synchronize Variant Pricing and Shipping.
      -> REQ: REQ-101 · deps: [T180, T182] · Done when: changing between the canonical sample variants updates the summary label, comparison price, discount, final total, and re-quotes shipping for an already selected destination.
- [x] **T188** — Resolve Ambiguous Kecamatan in Customer and Admin Flows.
      -> REQ: REQ-102 · deps: [T180] · Done when: `Taman` presents district-plus-city choices, selecting `Taman, Sidoarjo` resolves a real Mengantar destination ID with postal code `61257`, the district representative ranks before villages, and customer/admin flows use the same two-stage contract.
- [x] **T189** — Clarify Indonesian Online Payment and OMS Status.
      -> REQ: REQ-103 · deps: [T186] · Done when: QRIS, Virtual Account, and supported e-wallet records render channel-specific instructions and transparent amount/fee details without mobile overflow, while Order Management labels all paid-equivalent statuses as `Lunas`.

## Phase 59: AutoLaris Active Channel Enforcement — Complete Locally

- [x] **T190** — Disable Provider-Rejected DANA Checkout.
      -> REQ: REQ-104 · deps: [T186, T189] · Done when: `DANA` is absent from the public payment-method response and checkout UI, a forged `payment_channel=DANA` order fails schema validation before persistence or provider invocation, historical DANA payment details remain renderable, and tests/check/build pass.

## Phase 60: Retired Tenant Cloudflare Cleanup — Complete

- [x] **T191** — Retire the Removed Tenant Cloudflare Stack.
      -> REQ: REQ-105 · deps: [T170] · Done when: both exact tenant Workers and its isolated D1/KV/R2 resources are permanently deleted with explicit approval, sibling Petani resources remain present, the tenant is absent from deployable configuration, the standalone deployment config is removed, and remote inventory confirms absence.

## Phase 61: Final Removed-Tenant Purge — In Progress

- [x] **T192** — Remove Local Repository, Assets, and Named References.
      -> REQ: REQ-105 · deps: [T191] · Done when: the local standalone repository and tenant-specific CMSAds assets are deleted, and no tenant name, domain, Worker, repository, or branch identifier remains in the current CMSAds working tree.
- [ ] **T193** — Delete the Standalone GitHub Repository.
      -> REQ: REQ-105 · deps: [T192] · Done when: the exact private repository is absent from GitHub. Current blocker: the authenticated `gh` token lacks the `delete_repo` OAuth scope; `gh repo delete` returned HTTP `403`, and the interrupted device authorization did not complete.
- [x] **T194** — Rename the CMSAds Release Branch and Finalize.
      -> REQ: REQ-105 · deps: [T192] · Done when: the cleanup is committed and pushed to `petanisejahtera-preview`, the obsolete remote branch is removed, and CMSAds tests/check/build pass.

## Phase 62: Documentation Current-State Hardening — Complete Locally

- [x] **T195** — Reconcile Current Documentation and Visual Guide.
      -> REQ: REQ-66, REQ-80, REQ-105 · deps: [T192, T194] · Done when: current-state documentation reflects the single registered tenant, historical headless releases are not presented as active inventory, all local links/fragments and semantic landmarks pass static audit, the changed guide pages pass desktop/mobile browser QA without overflow or console/network errors, and tenant validation plus tests/check/build pass.

## Phase 63: Connected Multi-Tenant Architecture Guide - Complete Locally

- [x] **T196** — Visualize CMSAds Fleet and Tenant Isolation.
      -> REQ: REQ-66, REQ-80, REQ-88 · deps: [T195] · Done when: the HTML guide draws connected lanes from shared CMSAds source to current and future integrated/headless tenant runtimes; each lane identifies Worker, Admin/API, D1/KV/R2/AI, secrets, and provider boundaries; future examples cannot be mistaken for active inventory; and desktop/mobile browser QA plus project validation pass.

## Phase 64: Tenant Frontend Repository Boundary - Complete Locally

- [x] **T197** — Document Integrated and Headless Repository Ownership.
      -> REQ: REQ-66, REQ-88, REQ-93 · deps: [T196] · Done when: the HTML guide explains which tenants need a separate frontend repository, diagrams both repository-to-Worker-to-domain paths, keeps CMSAds backend ownership canonical, distinguishes independent release pipelines, blocks per-merchant backend forks, and passes desktop/mobile browser plus project validation.

## Phase 65: Invoice Receiver Scoring Route Repair - Complete Locally

- [x] **T198** — Repair Invoice Scoring Navigation and Lookup.
      -> REQ: REQ-38, REQ-68 · deps: [T95] · Done when: `Cek skor lengkap` from an invoice opens canonical `/admin/check` with the customer phone prefilled, receiver lookup calls implemented `/api/admin/check`, obsolete `/admin/scoring` references are absent from source, and browser plus project validation pass.

## Phase 66: Order-to-Mengantar Operational Cutover - Complete Locally

- [x] **T199** — Enforce Provider-Accepted Shipping and Order-Owned Dispatch.
      -> REQ: REQ-74, REQ-75, REQ-76, REQ-79 · deps: [T147] · Done when: pending orders stay in Order Management; district and city token search resolves a real Mengantar destination; eligible rows expose single and checklist bulk Push actions; bulk calls remain sequential with per-order results; only provider-accepted orders enter Shipping; rejected orders remain pending with an actionable error; Shipping owns resi/status/pickup only; and tests, typecheck, tenant validation, build, plus desktop/mobile browser QA pass.

## Phase 67: Product Form Links and Lightweight HTML Embed — In Progress Locally

- [x] **T200** — Expose Canonical Product Form Integration Links.
      -> REQ: REQ-106 · deps: [T199] · Done when: an authenticated operator viewing an active checkout-complete product can copy tenant-origin `middle`, `full`, and `hybrid` URLs for its canonical D1 product ID, optionally select a canonical variant ID, and copy a responsive no-parent-JavaScript iframe snippet when embedding is enabled; inactive or checkout-incomplete products show the exact blocker rather than a usable checkout link.
- [x] **T201** — Implement the Scoped Server-Rendered Embed Boundary.
      -> REQ: REQ-107 · deps: [T200] · Done when: one dedicated embed route renders the existing CMSAds form state machine without copying commerce logic; plain iframe HTML remains usable at mobile and desktop widths with a fixed-height fallback; an optional tiny adapter only synchronizes height; the response uses an explicit tenant origin allowlist in CSP `frame-ancestors` and omits `X-Frame-Options` only there; missing/invalid origins fail closed; every other route retains the non-frameable security contract.
- [ ] **T202** — Prove Cross-Origin Form Embed End to End.
      -> REQ: REQ-107 · deps: [T201] · Done when: an executable fixture on an allowed distinct origin loads the iframe without parent JavaScript, product/variant switching and destination/shipping/payment behavior use live CMSAds contracts, a valid submission creates exactly one pending D1 order, a disallowed origin is blocked by CSP, no secrets appear in browser responses, keyboard/focus/error behavior works, and mobile/desktop browser evidence plus project validation pass without invoking a live Mengantar mutation.

## Phase 68: Tenant Operator Role-Based Access Control — Complete Locally

- [x] **T203** — Implement Owner-Managed Operational Roles.
      -> REQ: REQ-17, REQ-18, REQ-71 · deps: [T196] · Done when: owner can create and revoke admin, advertiser, and customer-service credentials with forced password rotation; legacy collaborators migrate to advertiser; one deny-by-default policy governs sidebar/search visibility plus page/API enforcement including child routes; owner alone manages users; admin operates all other tenant workflows; advertiser is limited to dashboard/products/content/media/ads/profile; customer service is limited to dashboard/orders/shipping/check/rates/profile; unauthorized APIs return `403`; unauthorized pages redirect to the role default; and unit, type, tenant, build, plus desktop/mobile browser proof pass.

## Phase 69: Responsive Landing-Page Form Widget — Complete Locally

- [x] **T204** — Ship the Progressive CMSAds Form Widget.
      -> REQ: REQ-108 · deps: [T201] · Done when: the product embed dialog emits a copy-ready custom element with canonical product/variant/mode attributes, an eager fixed-height iframe fallback, exact-origin auto-height synchronization, reactive attribute updates, responsive mobile sizing, and retained plain iframe options; the loader adds no checkout or tracking fork; focused contract tests, typecheck, build, and mobile/desktop browser proof pass.

## Phase 70: Tenant Embed Policy and District Resolution — Complete Locally

- [x] **T205** — Move Embed Origin Policy into Tenant Settings.
      -> REQ: REQ-107, REQ-109 · deps: [T201] · Done when: owner/admin can view, normalize, save, clear, and immediately apply at most 25 exact HTTPS origins from Store & CS settings; domains and subdomains remain distinct; invalid origins are rejected; NULL rows retain the environment cutover fallback; stored empty and D1 failures fail closed; non-embed routes remain non-frameable; and focused tests, migration, project validation, plus desktop/mobile browser proof pass.
- [x] **T206** — Resolve Administrative District Names to Provider IDs.
      -> REQ: REQ-102 · deps: [T199] · Done when: the newer local district catalog remains discovery-only; administrative district/city prefixes normalize without a place-specific exception; Cakung plus Administrasi Jakarta Timur resolves only provider Cakung/Jakarta Timur results; same-name results from another city are excluded; unresolved IDs cannot reach quote/estimate calls; and focused tests, project validation, plus an executable provider-backed scenario pass.

## Phase 71: Provider District Coverage Hardening — Complete Locally

- [x] **T207** — Harden District Resolution Across Provider Naming Differences.
      -> REQ: REQ-102 · deps: [T206] · Done when: resolution retries bounded exact, compact-prefix-plus-city, and compact-prefix provider queries; acceptance still requires exact compact district plus normalized city; same-city provider results become explicit subdistrict alternatives when an exact match remains unavailable; a representative cross-region audit is executable; and focused tests, project checks, plus browser quote proof pass without saving an order.

## Phase 72: Exhaustive District Provider Screening — Complete Locally

- [x] **T208** — Screen Every Active District Against Mengantar.
      -> REQ: REQ-102 · deps: [T207] · Done when: all 7,284 unique active district-city-province records are screened through a resumable read-only provider audit; exact, explicit-provider-alternative, unavailable, and request-error outcomes are counted; measured spacing, punctuation, administrative, and historical city aliases are normalized without cross-city auto-selection; unresolved checkout selections switch to direct kelurahan/desa provider search; and browser proof reaches a real quote without saving an order.

## Phase 73: Historical Provider District Split Recovery — Complete Locally

- [x] **T209** — Resolve Jakabaring Against Mengantar's Legacy Palembang District.
      -> REQ: REQ-102 · deps: [T208] · Done when: selecting current `Jakabaring / Palembang` returns only its five verified kelurahan from Mengantar's legacy `Seberang Ulu I` records; unrelated legacy kelurahan and other cities are excluded; each choice preserves its real provider ID and postal code; and browser proof loads a real shipping quote without saving an order.

## Phase 74: COD Province Policy Normalization — Deployed to Preview

- [x] **T210** — Normalize Provider Province Names Before Applying COD Policy.
      -> REQ: REQ-103 · deps: [T209] · Done when: Mengantar's formal province names for DKI Jakarta and DI Yogyakarta normalize to the same canonical codes used by Store & CS Settings; only provinces listed in `cod_disabled_province_codes` lose COD; server validation uses the same policy; and mobile browser proof covers Jakarta, Yogyakarta, Jawa Barat, and disabled Jawa Timur without saving an order.

## Phase 75: Embed Checkout Handoff and Pickup Recovery — Deployed to Preview

- [x] **T211** — Redirect Embedded Checkout at the Parent Page.
      -> REQ: REQ-110 · deps: [T210] · Done when: successful embedded COD checkout replaces the landing page with `/thanks`; pending QRIS/VA checkout replaces it with `/payment`; widget and auto-height adapters validate message origin, iframe source, target origin, and allowed path; and plain iframe checkout attempts direct top navigation.
- [x] **T212** — Recover Missing or Stale Mengantar Pickup Address IDs.
      -> REQ: REQ-111 · deps: [T211] · Done when: Pickup Address ID is optional in warehouse settings; a valid provider address is reused by ID or exact profile; a stale ID is never sent back as an update target; a missing address is created by Mengantar; and only the confirmed provider ID is persisted locally.

## Phase 76: Payment Fee Attribution and City Shipping Fallback — Deployed to Preview

- [x] **T213** — Make AutoLaris Fee Ownership Explicit.
      -> REQ: REQ-112 · deps: [T212] · Done when: Store Payment Gateway settings expose one buyer/seller fee toggle; buyer is the schema and migration default; API responses calculate the configured AutoLaris fixed or percentage tariff; seller-paid fees are excluded from the customer total; and order plus payment records retain the applied bearer and amounts.
- [x] **T214** — Keep Advertising Conversion Value Merchandise-Only.
      -> REQ: REQ-113 · deps: [T213] · Done when: checkout receipts retain merchandise unit price and quantity separately from shipping, admin fee, and billed total; Meta browser/server Purchase, Google Ads conversion, and GTM ecommerce purchase receive only unit price times quantity; and duplicate transaction identifiers remain unchanged.
- [x] **T215** — Add the Internal ICO City-Average Expedition.
      -> REQ: REQ-114 · deps: [T214] · Done when: a destination with no eligible direct quote samples up to three distinct same-city provider destinations, averages their cheapest eligible quotes, rounds to Rp1,000, exposes `ICO · Estimasi rata-rata kota`, and returns no fabricated fallback when every sample is invalid.

## Phase 77: COD Service Fee and VAT Attribution — Pushed to Preview Branch

- [x] **T216** — Apply the COD Service Fee and VAT Policy.
      -> REQ: REQ-115 · deps: [T213] · Done when: COD charges 3% of merchandise plus shipping and 11% VAT on that service fee; Payment Gateway settings expose an independent buyer/seller COD policy; all checkout variants, order persistence, admin edits, order detail, and Mengantar collection amounts use the same fee breakdown; and seller-paid fees remain excluded from the customer total.

## Phase 78: Provider-Neutral Location Recovery and Payment UX — Deployed to Preview

- [x] **T217** — Remove Provider Branding from Browser Surfaces.
      -> REQ: REQ-116 · deps: [T216] · Done when: a repository scan of browser-rendered copy and browser-consumed API errors finds no `Mengantar` brand, while courier names and internal provider implementation identifiers remain intact.
- [x] **T218** — Open Related Destinations for District Mismatches.
      -> REQ: REQ-117 · deps: [T217] · Done when: focused location contracts and a browser search show that selecting an unresolved district opens same-city alternatives immediately, and Jakabaring prioritizes related Seberang Ulu destinations without another typed query.
- [x] **T219** — Remove Fee-Bearer Copy from Public Checkout.
      -> REQ: REQ-118 · deps: [T217] · Done when: COD, QRIS, and Virtual Account options still disclose their tariff but public payment copy contains neither buyer-paid nor seller-paid attribution; authenticated policy controls remain explicit.
- [x] **T220** — Add Approved Bank Image Marks.
      -> REQ: REQ-119 · deps: [T219] · Done when: the nine approved PNG assets from the operator workstation are represented as optimized local SVG image assets, checkout and `/payment` map every supported channel to the right mark, and failed assets retain a readable bank label.
- [x] **T221** — Persist Seller Bank Accounts.
      -> REQ: REQ-120 · deps: [T216] · Done when: a D1 migration creates ordered store-scoped seller bank accounts, validation accepts only supported bank codes plus valid holder/account data, duplicates are rejected, and focused contracts cover normalization and ordering.
- [x] **T222** — Manage Seller Accounts in Payment Settings.
      -> REQ: REQ-120 · deps: [T221] · Done when: an authenticated owner/admin can add, edit, activate, reorder, and remove multiple seller accounts with inline errors and persisted reload results at mobile and desktop widths.
- [x] **T223** — Separate Virtual Account and Seller Transfer Checkout.
      -> REQ: REQ-121 · deps: [T220, T221] · Done when: checkout exposes distinct Virtual Account and Transfer Bank groups, selecting seller transfer submits a manual-transfer order without an AutoLaris request, snapshots the chosen account, applies zero admin fee, and routes to `/payment`.
- [x] **T224** — Render Manual Bank Transfer Payment Instructions.
      -> REQ: REQ-122 · deps: [T223] · Done when: a stored manual-transfer order reloads through the public status token and `/payment` shows the snapshotted logo, holder, account number, exact amount, copy controls, manual verification notice, and transfer guide without an automatic confirmation claim.
- [x] **T225** — Refine Buyer and Admin Payment Interfaces.
      -> REQ: REQ-123 · deps: [T218, T219, T220, T222, T224] · Done when: browser checks at 390px and 1280px exercise checkout selection, seller-account management, QRIS/VA payment, and manual transfer with no page-level overflow, clipped controls, keyboard-inaccessible actions, console errors, or failed application requests.
- [x] **T226** — Release Payment and Location Refinements to Preview.
      -> REQ: REQ-123 · deps: [T225] · Done when: focused tests, `npm run check`, tenant validation, and production build pass; documentation records evidence; commits are pushed; the remote migration precedes the approved preview Worker deployment; and deployed mobile/desktop browser smoke checks pass.

## Phase 79: Public Checkout Payment Mark Alignment — Deployed to Preview

- [x] **T227** — Center and Standardize Public Payment Marks.
      -> REQ: REQ-119 · deps: [T226] · Done when: COD, QRIS, Virtual Account, and seller-bank rows use compact `3:2` marks with subtle rounding, COD has a text treatment matching the image footprint, every mark is vertically centered against the complete payment row, and mobile/desktop browser checks show no horizontal overflow.

## Phase 80: Payment Fee Clarity and Public Asset Payload — Deployed to Preview

- [x] **T228** — Expose Actual Checkout Fees Across Variant and Shipping Changes.
      -> REQ: REQ-124 · deps: [T216, T225] · Done when: full checkout recalculates the displayed COD and QRIS amount after variant or shipping changes, Virtual Account rows retain their concrete fixed fee with readable label spacing, and middle checkout plus its thank-you state distinguish the product estimate from Customer Service-confirmed final charges.
- [x] **T229** — Standardize Public Payment Assets and Discovery Records.
      -> REQ: REQ-119, REQ-125 · deps: [T227] · Done when: COD uses a compressed local `3:2` image, all checkout marks share one compact frame, and `/api/payment-methods` returns only frontend-safe channel, fee, state, and local asset data.
- [x] **T230** — Clarify Authenticated Payment Policy and Login Identity.
      -> REQ: REQ-126 · deps: [T225] · Done when: Payment Gateway settings explain fixed and percentage AutoLaris tariffs plus buyer/seller effects, and the login header no longer repeats the tenant domain below the CMS logo.

## Phase 81: Seller Bank Validation and Stable Payment Selection — Deployed to Preview

- [x] **T231** — Rebuild Seller Bank Management with Canonical shadcn Controls.
      -> REQ: REQ-120, REQ-127 · deps: [T230] · Done when: bank selection, recipient and account inputs, save/cancel controls, account actions, loading/status states, and responsive layout use the installed shadcn components; recipient names reject digits; account numbers reject non-digits at both browser and API boundaries; and operators see a cross-check warning before saving.
- [x] **T232** — Stabilize and Order Checkout Payment Selection.
      -> REQ: REQ-128 · deps: [T228, T229] · Done when: checkout renders QRIS, Transfer Bank, Virtual Account, and COD in that order; payment and group clicks preserve existing DOM nodes; and browser evidence records zero payment-list replacements, layout shift, or horizontal overflow.

## Phase 82: Vector Assets, Admin Indexing, and Hybrid Form Refinements — Deployed to Preview

- [x] **T233** — Vector SVG Logo Assets, Favicon, and Profile Integration.
      -> REQ: REQ-129 · deps: [T232] · Done when: the official ChatGPT logo is converted to transparent vector SVG, favicon.ico, and PNG/WebP assets, and renders flat without frame or border on CMS Login and Admin Header Profile.
- [x] **T234** — Enforce Strict Indexing Boundaries for Admin & Auth Surfaces.
      -> REQ: REQ-130 · deps: [T233] · Done when: all admin layouts and login/auth pages set `<meta name="robots" content="noindex, nofollow" />`.
- [x] **T235** — Refine GeoIP Hybrid Form Dispatch & Order Tracking.
      -> REQ: REQ-131 · deps: [T234] · Done when: hybrid form dispatch defaults to Full Form when user location is unknown, resolves to Middle Form for COD-eligible provinces and Full Form for COD-excluded provinces, direct Middle Form remains accessible when location is non-restricted, and `/thanks` automatically fires Meta Purchase Pixel and Google Ads conversion upon order confirmation.

## Phase 83: Order Cleanup, Manual Deletion & WhatsApp CRM UI Refinement

- [x] **T236** — Trigger Abandoned Order on Storefront Phone Input & Auto-Delete (>7 Days Expiry).
      -> REQ: REQ-132 · deps: [T235] · Done when: entering Name + WhatsApp number on storefront forms records an abandoned lead draft (`shipping_status = 'abandoned'`), and abandoned/unpaid orders older than 7 days are automatically purged from D1 database `orders` and `order_items` during administrative queries to clean up cache bloat.
- [x] **T237** — Authenticated Admin Manual & Bulk Order Deletion API.
      -> REQ: REQ-133 · deps: [T236] · Done when: operators can delete single or bulk selected orders from `/admin/orders` via API `DELETE /api/admin/orders`, deleting associated D1 order rows, line items, and transaction logs with confirmation.
- [x] **T238** — Modular WhatsApp CRM Action Component & Visual State (WhatsApp Green / Black Clicked).
      -> REQ: REQ-134 · deps: [T237] · Done when: WhatsApp CRM follow-up buttons are refactored into modular React components (`CrmActionButton`, `CrmActionGroup`), displaying short labels (`W`, `D`, `F1`–`F5`, `P`, `C`, `U`), defaulting to WhatsApp Green (`#25D366`), and turning BLACK upon click to track completed operator follow-ups.
## Phase 84: Section-Based Landing Page Builder & 480px Canvas Engine — Deployed to Production

- [x] **T239** — Native Section-Based Landing Page Builder & 480px Mobile Canvas Parity.
      -> REQ: REQ-135 · deps: [T238] · Done when: `/admin/landing-pages` and `/admin/landing-pages/[id]` provide a native section-based landing page editor (`LandingPageEditor.tsx`) supporting HTML & Form sections, shortcode pills (`{{product_name}}`, `{{product_price}}`, etc.), drag/reordering, and a 480px mobile WYSIWYG canvas matching storefront rendering at `/[slug]`.

## Phase 85: Catalog Sorting, Auto-Active Embed, CRM Accordion & Clean Invoice UI — Deployed to Production

- [x] **T240** — Newest-First Product Catalog Sorting & Default Auto-Active Embed Status.
      -> REQ: REQ-136, REQ-137 · deps: [T239] · Done when: catalog query uses `ORDER BY created_at DESC, id DESC`, new products default to active status (`is_active = 1`), and manual D1 products synthesize automatically into storefront catalog and embed forms.
- [x] **T241** — Modular WhatsApp CRM Accordion, Clean Invoice Column & 3-Row Product Cell Hierarchy.
      -> REQ: REQ-138 · deps: [T240] · Done when: `CrmActionGroup` renders a trigger button `WA CRM (X/10)` expanding to a 2-col desktop / 5-col mobile grid, Invoice column omits duplicated product titles, and "Produk & Total" cell displays Product Title, Variant Title, and Total Amount in bold.
- [x] **T242** — Short 5-Digit Sequential Order Invoice Numbering (`INV-10001`).
      -> REQ: REQ-139 · deps: [T241] · Done when: public invoice numbers are generated as `INV-10001` upwards using `MAX(id)` from D1 `orders` table.

- [x] **T245** - Order Submission Failure & Redirect Repair (`/api/submit-order`, `/api/submit-middle-order`, checkout forms).
  -> REQ: REQ-10, REQ-16 · deps: [] · Done when: submit order storefront succeeds with 200 response, stores order in D1 without throw, and correctly redirects customer to `/thanks` or `/payment` page.
- [x] **T246** - Admin Invoice / Order Detail Blank Page Prevention & Safety Audit (`OrderDetail.tsx`, `/admin/orders/[invoice]`).
  -> REQ: REQ-24 · deps: [T245] · Done when: opening `/admin/orders/[invoice]` loads the order detail completely without React hook mismatch or blank white screen.

## Phase 71: Landing Page Catalog Dropdown UI/UX Refinement

- [x] **T247** - Sempurnakan UI/UX List Dropdown Produk Katalog D1 di Landing Page Editor (`LandingPageEditor.tsx`).
  -> REQ: REQ-135 · deps: [T239] · Done when: dropdown catalog product list in `/admin/landing-pages/*` renders 2-line title wrapping (`line-clamp-2`), price badge in bold font-mono emerald style, image/icon thumbnail preview, and clean item spacing without awkward text truncation.

## Phase 72: Full-System Heavy Audit & Code Precisioning (Order Submission & Admin Invoice Engine)

- [ ] **T248** - Comprehensive Tracing & Security Audit of Submit Order APIs (`/api/submit-order`, `/api/submit-middle-order`, `cmsads-form-widget.js`, `form-middle.ts`).
  -> REQ: REQ-10, REQ-16 · deps: [] · Done when: end-to-end tracing guarantees 100% reliable redirect to `/thanks` for COD and `/payment?order=...` for online payment, with strict payload validation, D1 mutation safety, and zero unhandled errors.
- [ ] **T249** - Comprehensive Tracing & React Hydration Audit of Admin Invoice Page (`/admin/orders/[id].ts`, `/admin/orders/[invoice].astro`, `OrderDetail.tsx`).
  -> REQ: REQ-24 · deps: [T248] · Done when: invoice page handles numeric IDs, invoice strings (`INV-10018`), and fallback keys with 100% uptime, zero React hook order violations, and clean fallback state rendering.

## Phase 73: Cloudflare Maximum Acceleration Engine Implementation
- [x] **T250** — Zero-Waterfall SSR Data Injection for Admin Pages (`/admin/orders`, `/admin/products`, `OrdersTable.tsx`, `ProductCatalog.tsx`).
      -> REQ: REQ-24, REQ-136 · deps: [T248, T249] · Done when: Astro server script fetches initial page data directly from D1 during SSR and passes it as `initialOrders` / `initialProducts` props to React islands (`client:load`), eliminating client-side `useEffect` fetch waterfalls on page load.
- [x] **T251** — D1 Multi-Column Performance Indexing & Query Batching (`migrations/0029_cloudflare_perf_indexes.sql`, `db.batch`).
      -> REQ: REQ-24 · deps: [T250] · Done when: migration `0029_cloudflare_perf_indexes.sql` adds composite indexes for orders, products, and order_items, and multi-query API routes execute via `db.batch([...])` in a single Cloudflare Edge roundtrip.
- [x] **T252** — Cloudflare Edge Micro-Caching & KV Storefront Acceleration (`/api/form-config`, `/api/v1/products`, KV `SESSION`).
      -> REQ: REQ-1, REQ-10 · deps: [T251] · Done when: storefront public endpoints emit Cloudflare Edge cache headers (`Cache-Control: public, max-age=60, s-maxage=300`) and store configurations use Cloudflare KV cache for 300s TTL.

- [x] **T253** — 100% E2E Checkout & Abandoned Lead Recovery Precision (`/api/record-abandoned-order`, `/api/submit-order`, `form-middle.ts`, `form-hybrid.ts`).
      -> REQ: REQ-10, REQ-16 · deps: [] · Done when: partial customer phone/name input records an abandoned lead (`shipping_status = 'abandoned'`), and submitting the order updates/promotes the lead to `shipping_status = 'pending'` without duplicating order records.
- [x] **T254** — Ads Signal Engine & CAPI Outbox Deduplication (`gclid`, `_fbp`, `_fbc`, `ttclid`, `capi_event_outbox`).
      -> REQ: REQ-16, REQ-18 · deps: [T253] · Done when: click IDs across Google, Meta, and TikTok are captured, stored in `orders.ad_click_ids`, and authoritative server CAPI `Purchase` events are queued with unique `event_id = order_number`.
- [x] **T255** — Mobile Core Web Vitals, SEO JSON-LD Schemas & PageSpeed Optimization (`src/layouts/BaseLayout.astro`, `src/components/seo/`, `src/pages/[slug].astro`).
      -> REQ: REQ-1, REQ-5 · deps: [T254] · Done when: JSON-LD schemas (`Product`, `Offer`, `BreadcrumbList`, `FAQPage`) render valid structured data, hero images use `fetchpriority="high"`, fonts/CSS avoid layout shifts (`CLS = 0`), and mobile LCP < 1.2s.
- [x] **T256** — Comprehensive Automated E2E Behavioral & Integration Test Suite (`src/lib/e2e-full-funnel.test.ts`).
      -> REQ: REQ-10, REQ-16, REQ-24 · deps: [T255] · Done when: automated test suite covers the complete funnel (partial abandoned lead -> order submission -> D1 persistence -> CAPI outbox queuing -> SEO markup rendering) with 100% pass rate.
- [x] **T257** — Product Catalog & Landing Page Admin UX Precision (`ProductCatalog.tsx`, `LandingPageCatalog.tsx`, `/api/admin/products`, `/api/admin/landing-pages`).
      -> REQ: REQ-136, REQ-137 · deps: [] · Done when: `ProductCatalog.tsx` provides instant inline active/inactive toggle switches, `LandingPageCatalog.tsx` enables one-click page duplication, and both offer responsive status filter badges.
- [x] **T258** — Order Management & CRM Workflow Precision (`OrdersTable.tsx`, `OrderDetail.tsx`, `/api/admin/orders`).
      -> REQ: REQ-24, REQ-138 · deps: [T257] · Done when: `OrdersTable.tsx` features quick status filter chips (`Semua`, `Terbengkalai`, `Menunggu`, `Diproses`, `Dikirim`), bulk status updates, and invoice search highlights.
- [x] **T259** — Developer Security & Access Manager UX Precision (`HeadlessApiManagement.tsx`, `AccessManager.tsx`, `/api/admin/settings/developer`).
      -> REQ: REQ-120, REQ-121 · deps: [T258] · Done when: `HeadlessApiManagement.tsx` offers instant API key creation, revocation, copy-to-clipboard buttons, and `AccessManager.tsx` provides clear role badge indicators.
- [x] **T260** — Comprehensive Automated System Precision Test Suite (`src/lib/system-precision.test.ts`).
      -> REQ: REQ-24, REQ-120, REQ-136 · deps: [T259] · Done when: automated test suite verifies inline catalog toggling, landing page duplication, bulk order updates, API key management, and security policies with 100% pass rate.
## Phase 74: Payment Options, Verified Health-Check & Manual Bank Sync

- [x] **T261** — Payment Master & Channel Toggle Backend Precision (`/api/admin/settings`, `save-payment-toggles`, `save-autolaris-channels`).
      -> REQ: REQ-11, REQ-24 · deps: [] · Done when: `save-payment-toggles` and `save-autolaris-channels` execute cleanly without throwing 500 error, `stores` columns exist/migrate safely, and single-string error response eliminates duplicated notices.
- [x] **T262** — Manual Bank Transfer Active/Inactive Synchronization (`/api/payment-methods.ts`, `seller_bank_accounts`, `form-hybrid.ts`).
      -> REQ: REQ-11, REQ-24 · deps: [T261] · Done when: `/api/payment-methods` includes `is_active` status for manual bank accounts, storefront hides inactive bank accounts from checkout options, and admin badge displays accurate active bank counts.
- [x] **T263** — Verified Read-Only AutoLaris Health-Check & Channel Status Matrix (`src/lib/autolaris-client.ts`, `/api/admin/settings`, `/admin/payments`).
      -> REQ: REQ-11 · deps: [T261, T262] · Done when: `verifyCredentials()` performs a zero-payload read-only authentication probe against AutoLaris server and channel status matrix displays live verified status (`● Aktif & Siap`, `○ Nonaktif`, `⚠ Key Ditolak Server`).
- [x] **T264** — E2E Payment & Health-Check Verification (`src/lib/autolaris-client.test.ts`, `node --test`).
      -> REQ: REQ-11, REQ-24 · deps: [T263] · Done when: unit test suite verifies read-only credential probing, payment fee calculations, and manual bank active filtering with 100% pass rate.

## Phase 75: Manual Product Upload Sorting, Auto-Active Embed & API Error Boundary

- [x] **T265** — Newest-First Product Catalog Sorting, Auto-Active Embed Status & Payment Methods Production Safety.
      -> REQ: REQ-11, REQ-136 · deps: [T264] · Done when: `/api/admin/products` and `catalog.ts` query products ordered by `created_at DESC, id DESC`, new products default to active (`is_active: 1`), `/api/payment-methods` handles missing DB configuration gracefully with HTTP 200 JSON responses, and live deployment on `permatamall.shop` is verified.

## Phase 76: System Audit Remediation & Hardening (Batches 1–6)

- [x] **T266** — Batch 1: Security & Privacy Hardening (`src/pages/thanks.astro`, `[slug].astro`, `LandingPageEditor.tsx`, `payment.astro`, `AccessManager.tsx`, `/api/v1/*`, `meta-event.ts`, `mengantar-client.ts`, `admin-credentials.ts`).
      -> REQ: SEC-1..11 · deps: [] · Done when: XSS sinks escaped, draft page preview requires admin auth, stored XSS in editor/bank fields sanitized, CSPRNG password generation active, /api/v1/* gated by API key validation, shipping cost server re-quoted, Mengantar API key hidden from path/D1 error logs, bootstrap admin credentials randomized, and checkout redirect URL PII stripped.
- [x] **T267** — Batch 2: Payment & Checkout Resilience (`src/pages/payment.astro`, `form-hybrid.ts`, `form-middle.ts`, `excluded-area.ts`).
      -> REQ: PAY-1..5 · deps: [T266] · Done when: payment.astro TDZ resolved, status_token query optional on refresh, submit_token generated per session, payment total preserves admin fee, shipping rate race conditions guarded, and COD excluded area province codes matched.
- [x] **T268** — Batch 3: Order, Stock & Dispatch Correctness (`settings.ts`, `orders/[id].ts`, `OrderDetail.tsx`, `validation.ts`, `order-schema.ts`, `stock-restore.ts`, `mengantar-dispatch.ts`).
      -> REQ: ORD-1..7 · deps: [T267] · Done when: AutoLarisClient imported, nextCustomerPhone TDZ fixed, order delete SQL references reference_id, order address edit updates destination_area_id & calls setShippingRates, phone format standardized, stock restored on all cancel/delete paths, and dispatch retry is idempotent.
- [x] **T268b** — Mengantar Location Provider Destination ID Resolution & Shipping Rates Display (`/api/locations.ts`, `OrderDetail.tsx`, `form-hybrid.ts`).
      -> REQ: ORD-8 · deps: [T268] · Done when: location resolution preserves `location_id` / `id` for Mengantar shipping estimation and `OrderDetail.tsx` updates `shippingRates` state properly.
- [x] **T269** — Batch 4: Tracking & Analytics Signals (`src/lib/meta-event-contract.ts`, `MetaPageViewTracker.astro`, `src/lib/json-ld.ts`, `public/robots.txt`).
      -> REQ: TRK-1..2 · deps: [T268b] · Done when: Meta CAPI Purchase event_id derived securely without URL pollution, and server-side PageView accepts slug-based product paths without 400 rejection.
- [x] **T270** — Batch 5: Type Safety, CI Gate & Performance (`npx astro check`, `npx tsc --noEmit`, `.github/workflows/deploy.yml`).
      -> REQ: TYP-1..3 · deps: [T269] · Done when: `npx astro check` and `npx tsc --noEmit` exit 0 with 0 errors, CI deploy gate passes, and lighthouse/a11y verified.
- [x] **T271** — Batch 6: Documentation & Production Deployment Alignment (`AGENTS.md`, `VERSION.md`, `STATUS.md`, `BUILD-LOG.md`, `TASKS.md`).
      -> REQ: DOC-1 · deps: [T270] · Done when: all system docs reflect latest single-tenant Permatamall CLI scripts, real repository contracts, 187/187 test pass rate, 0 type errors, and clean live deployment to permatamall.shop.
- [x] **T272** — Abandoned Lead Invoice Number Promotion & Payload Enrichment (`src/lib/order-persistence.ts`, `src/scripts/form-hybrid.ts`, `e2e-full-funnel.test.ts`).
      -> REQ: PAY-6 · deps: [T271] · Done when: `persistOrder()` promotes draft lead order numbers from `ABN-` to official `INV-` invoice numbers upon order submission, `form-hybrid.ts` captures selected `variant_id` and calculated `total_amount` during partial lead auto-save, unit test suite passes with 187/187 100% pass rate, 0 TypeScript/Astro check errors, and live build deployed to permatamall.shop.
- [x] **T273** — Google Merchant & Meta Commerce Catalog Feed Content-ID Synchronization (`src/lib/catalog-feed.ts`, `src/lib/catalog-feed.test.ts`, `src/pages/feed/google-catalog.xml.ts`, `src/pages/feed/meta-catalog.xml.ts`).
      -> REQ: TRK-3 · deps: [T272] · Done when: `google-catalog.xml` and `meta-catalog.xml` generate `<g:id>` strictly matching tracking `content_id` (`product.productId` for single variants and primary variant, ignoring variant SKUs like `variant_...`, with `<g:item_group_id>` for multi-variant products), unit test suite passes with 192/192 100% pass rate, 0 TypeScript/Astro check errors, and live build deployed to permatamall.shop.
- [x] **T274** — Full Catalog Restoration, Responsive Multi-Photo Slider & D1 Product Variants Seed (`scripts/seed-catalog.sql`, `src/components/storefront/ProductImageSlider.tsx`, `src/lib/catalog-data.ts`, `src/data/products.ts`, D1 `OMS_DB`).
      -> REQ: CAT-1 · deps: [T273] · Done when: 22 products and 110 variants are seeded into D1 database `OMS_DB`, product page mounts interactive `ProductImageSlider` component with adaptive ratio frame and multi-photo thumbnail gallery, `catalog-data.ts` builds 7-photo image galleries per product, test suite passes with 192/192 100% pass rate, 0 TypeScript/Astro check errors, git pushed to main, and live deployment on `https://permatamall.shop/` verified.

- [x] **T275** - Luxury Header, Footer & Base Layout Polish (`SiteHeader.astro`, `SiteFooter.astro`, `BaseLayout.astro`).
 -> REQ: UI-1 · deps: [T274] · Done when: header announcement ticker uses dark onyx `#09090B` container with pulsing live status dot, glassmorphism sticky header with clean links, and footer uses deep onyx canvas with refined legal links.
- [x] **T276** - Luxury Homepage Templates Rebuild (`WideCatalogHome.astro`, `CompactMarketHome.astro`, `ProductListItem.astro`).
 -> REQ: UI-2 · deps: [T275] · Done when: `WideCatalogHome` displays warm studio canvas `#FBFBFB`, editorial typography, elevated product cards with discount badges, COD available indicator, and 4-point minimalist trust grid.
- [x] **T277** - Product Detail Page PDP Luxury Overhaul (`src/pages/produk/[slug].astro`, `ProductImageSlider.tsx`).
 -> REQ: UI-3 · deps: [T276] · Done when: PDP renders clean price block, aggregate rating summary, variant list, verified buyer reviews, and mounts a sticky mobile purchase bar for instant COD checkout trigger.
- [x] **T278** - Order Form & Checkout Minimalist Visual Refinement (`GeoIpResolvedForm.astro`, `form-hybrid.css`).
 -> REQ: UI-4 · deps: [T277] · Done when: order form visual colors align with luxury minimalist palette while preserving 100% of underlying form bindings, field handlers, and checkout submit logic.
- [x] **T279** - Full Verification, Build & Live Production Deployment (`npm test`, `npx tsc --noEmit`, `npx astro check`, `wrangler deploy`).

## Phase 77: Public Storefront Luxury Minimalist UI/UX Overhaul (Mobile-First 480px)

- [x] **T280** — Non-Sticky Clean Header & Luxury Navigation (`SiteHeader.astro`, `SiteFooter.astro`).
      -> REQ: UI-1 · deps: [T279] · Done when: header uses non-sticky clean document flow layout on homepage, top announcement ticker uses Onyx `#09090B` background with pulsing status dot, and footer presents clean luxury branding inside 480px container.
- [x] **T281** — Frameless Rounded Luxury Product Cards & Homepage Showcase (`CompactMarketHome.astro`, `ProductsSection.astro`, `HeroSection.astro`, `SolutionsSection.astro`, `ProofsSection.astro`).
      -> REQ: UI-2 · deps: [T280] · Done when: homepage product grid uses rounded luxury card presentation without bulky borders/shadows, 3:4 portrait image frame, discount tags, rating summary pill, and warm studio canvas `#FBFBFB` background inside max-w-[480px] shell.
- [x] **T282** — Product Detail Page PDP & Form Visual Refresh (`src/pages/produk/[slug].astro`, `ProductImageSlider.tsx`, `GeoIpResolvedForm.astro`).
      -> REQ: UI-3 · deps: [T281] · Done when: PDP renders rounded luxury product gallery, Onyx price typography, and checkout form container matches emerald/slate visual styling without touching form logic or DOM field structure.
- [x] **T283** — Full Verification & Local Preview (`npm test`, `npx tsc --noEmit`, `npx astro check`).
      -> REQ: UI-4 · deps: [T282] · Done when: unit test suite passes 192/192, 0 TypeScript and Astro check errors, local dev server running on Tailscale IP `http://100.127.67.86:4321/`, and 0 git push / 0 wrangler deploy executed.

## Phase 78: Ground-Up Sharp Luxury Boutique Redesign (Mobile-First 480px)

- [x] **T284** — Simple Minimalist Header & Footer (`SiteHeader.astro`, `SiteFooter.astro`).
      -> REQ: UI-1 · deps: [T283] · Done when: header and footer present ultra-simple minimalist aesthetic with thin 1px borders, deep ebony #111111 ticker, and non-sticky document flow inside max-w-[480px] shell.
- [x] **T285** — Vertical Left Thumbnail Product Gallery (`ProductImageSlider.tsx`).
      -> REQ: UI-2 · deps: [T284] · Done when: PDP image slider presents miniature thumbnails stacked vertically on the LEFT side of the main active image frame.
- [x] **T286** — Catalog List Capped at Max 15 Products (`src/pages/produk/index.astro`).
      -> REQ: UI-3 · deps: [T285] · Done when: product catalog page strictly limits item rendering to maximum 15 products with high-precision luxury layout.
- [x] **T287** — Homepage & PDP Sharp Luxury Overhaul (`CompactMarketHome.astro`, `HeroSection.astro`, `ProductsSection.astro`, `src/pages/produk/[slug].astro`).
      -> REQ: UI-4 · deps: [T286] · Done when: homepage and PDP render sharp luxury boutique styling without bulky rounded cards, warm alabaster #F8F7F4 canvas, champagne gold #C5A880 accents, and 100% untouched checkout form logic.
- [x] **T288** — Full System Verification & Tailscale Preview (`npm test`, `npx tsc --noEmit`, `npx astro check`).
      -> REQ: UI-5 · deps: [T287] · Done when: unit test suite passes 192/192, 0 TypeScript and Astro check errors, local dev server running on Tailscale IP `http://100.127.67.86:4321/`, and 0 git push / 0 wrangler deploy executed.
 -> REQ: UI-5 · deps: [T278] · Done when: unit test suite passes 192/192, 0 TypeScript and Astro check errors, production build deployed to Cloudflare Worker, git committed to main, and verified on `https://permatamall.shop/`.

## Phase 79: Storefront 22-Product Content, Realistic Compare Prices & Full SEO Schema Overhaul

- [x] **T289** — Complete 22/22 Bespoke Product Descriptions (`src/lib/catalog-data.ts`).
      -> REQ: UI-6 · deps: [T288] · Done when: bespoke editorial details (subheadline, boutique description, 4 benefits, QC guarantee, usage scenario) are implemented for all 22 products in catalog-data.ts.
- [x] **T290** — Realistic Compare Price & Dynamic Discount Calculation (`src/lib/catalog-data.ts`).
      -> REQ: UI-7 · deps: [T289] · Done when: `getRealisticComparePrice` calculates dynamic compare prices (26%–41% discount) and static 300k placeholders are eliminated.
- [x] **T291** — Sticky Mobile Purchase Bar Auto-Hide (`src/pages/produk/[slug].astro`, `StickyCTA.astro`).
      -> REQ: UI-8 · deps: [T290] · Done when: IntersectionObserver rootMargin `0px 0px -40px 0px` smoothly hides sticky bar upon reaching `#form-pemesanan`.
- [x] **T292** — Full SEO Meta & Google Merchant Schema Compliance (`json-ld.ts`, `JsonLdSchema.astro`, `[slug].astro`).
      -> REQ: UI-9 · deps: [T291] · Done when: Open Graph, Twitter Cards, Canonical URLs, and Google Merchant Schema (MerchantReturnPolicy & OfferShippingDetails) are active.
- [x] **T293** — Verification & Production Live Deployment (`npm test`, `npx tsc --noEmit`, `npx astro check`, `wrangler deploy`).
      -> REQ: UI-10 · deps: [T292] · Done when: 192/192 Node tests pass, 0 typecheck/Astro check errors, clean build deployed live to `https://permatamall.shop/` (commit `f44c2f1`).

## Phase 80: 5-Digit Minimum Product Content-ID Pattern Lock & Auto-Taxonomy Feed Synchronization

- [x] **T294** — 5-Digit Minimum Product Content-ID Pattern Lock (`src/lib/meta-event-contract.ts`).
 -> REQ: TRK-4 · deps: [T293] · Done when: `PRODUCT_ID_PATTERN` enforces `/^[A-Za-z0-9_./-]{5,128}$/` minimum 5-character/digit product content IDs for Meta and Google tracking outbox validation.
- [x] **T295** — Automated Product Content ID Normalization & Feed Synchronization (`src/lib/catalog-feed.ts`, `src/lib/catalog-feed.test.ts`).
 -> REQ: TRK-5 · deps: [T294] · Done when: `formatContentId(id)` normalizes numeric product IDs < 10000 to 5-digit strings (`10001`+), XML feeds (`google-catalog.xml`, `meta-catalog.xml`) emit 5-digit `<g:id>` and `<g:item_group_id>`, unit tests pass 194/194, 0 TypeScript/Astro check errors, git committed and deployed live to `https://permatamall.shop/` (commit `bd98145`).

---

# Phase A — AdsBookCMS Foundation

Active backlog. Every task below references a requirement in the current `PRD.md` and, where relevant, a gap from `ARCHITECTURE.md` §10. Ordered by severity, not by dependency.

## Phase A order of work

Phase A is not a checklist to work top to bottom. It has one critical path and a set of tasks that are genuinely independent of it.

**Critical path — everything about being installable runs through here:**

```
A-10 runtime identity  →  A-11 /install wizard  →  A-12b fail-closed setup state
      ↓
A-50 install topology (blocked until A-10 removes the build-time constraint)
```

`A-10` was the keystone, and it has landed. Identity now resolves from the `stores` row per request, so the wizard can set a store's name, one build can serve two installs, and the topology question in **A-50** can finally be judged on its merits — which makes A-50 the next decision, not the next implementation task.

**Independent of the critical path** — these touch disjoint files and can proceed in any order, including in parallel: A-5, A-7, A-8, A-9, A-13, A-21, A-24, A-25, A-30, A-31, A-32, A-41, A-42.

**Ordering constraints that are not obvious:**
- `A-13` (schema version check at boot) is small and independent, but it is what makes `A-51` measurable — without it there is no way to ask an install which product version it is running.
- `A-30`/`A-31`/`A-32` are browser-visible. They need visual verification, not just a green build; `A-37` is the precedent for why.
- `A-24` (Drizzle) is settled: retired, not repaired. There is no journal left to trap the next contributor; migrations are hand-authored and `wrangler` reads the directory.

---

## A1 — Live integrity (production is currently wrong)

- [x] **A-1** — Remove fabricated social proof from product presentation (`src/lib/catalog-data.ts`). **Done 2026-08-16.**
 -> REQ: REQ-16 · Done when: the three hardcoded named reviews, `METRICS_TABLE` rating/review/sold values, and `getRealisticComparePrice()` no longer reach any public page; `aggregateRating` is emitted only from recorded data or omitted entirely; `npm test` green.
- [x] **A-2** — Replace vendor advertising artwork used as store brand (`public/images/logo.webp`, `public/favicon.*`, `public/admin-login.webp`, `public/og-admin.webp`). **Done 2026-08-16** — placeholders pending real brand assets.
 -> REQ: REQ-18 · Done when: no CMS Ads artwork remains reachable; `tenantConfig.logo`, the admin shell logo, the product-image fallback (`catalog-data.ts`), the landing-card image (`tenant-content.ts`), and the admin `og:image` all resolve to this store's own assets.
- [x] **A-3** — Neutralise the canonical sample product. **Done 2026-08-16** — resolved by *removing* the immutability concept, not repointing it.
 -> REQ: REQ-9 · gap: G4 · ADR-006 · Done when: a new forward migration replaces product 10001 with a neutral, clearly labelled placeholder using an owned image; `src/lib/sample-product.ts` and the admin strings in `ProductForm.tsx` / `ProductCatalog.tsx` / `admin/products/edit.astro` agree with it; the record is deletable once a real product exists.
- [x] **A-4** — Scrub or delete `src/db/seed.sql`. **Done 2026-08-16** — deleted and consolidated into `scripts/seed-catalog.sql` behind `npm run db:reset:demo:local`.
 -> REQ: REQ-9 · Done when: the file no longer contains another merchant's catalog, the two genuine-looking Mengantar ObjectIds, the Surabaya warehouse address, or the contact phone number; either replaced by a neutral install seed or removed with its image trees.
- [x] **A-5** — Make ad taxonomy matching deterministic. **Done 2026-08-16.** Whole-word matching, title weighted above description, description capped below a single title hit, and a `MIN_SCORE` floor so the default wins ties and under-confidence. Proven by running the new tests against the old file: a leather shoulder bag classified as fertilizer, a face serum as soap, a data cable as a handbag because "bagus" contains "bag".
 -> REQ: REQ-56 · Done when: category resolution no longer relies on an unweighted keyword count across title and description with no minimum score; a handbag whose description mentions unrelated terms cannot be shipped to Merchant Center under a fertilizer, skincare, or cutlery category. Note: the handbag rule (`6551`) is already both the first rule and the default — the defect is the scoring, not the mapping.
- [x] **A-6** — Align Meta Purchase `event_id` across browser and server. **Done 2026-08-16.**
 -> REQ: REQ-50 · gap: G9 · The browser now derives the Purchase `eventID` from `order_number` in the `/api/order-status` response — the same D1 column the CAPI leg uses — instead of minting `purchase_<slug>_<random>`. If the order cannot be resolved the tracker fires nothing rather than a mismatched id. The server gate (`order_number` + `status_token`, 404 on mismatch) and the outbox idempotency key are untouched. Test `src/lib/meta-purchase-dedup.test.ts` executes the real inline tracker script against a stubbed browser and asserts the Pixel `eventID`, the posted `event_id`, and `resolveMetaEventId()` all produce one string; mutation-checked.
 · **Forward-only.** Meta dedups at ingestion within 48 hours with no retroactive merge, so historical Purchase counts stay roughly doubled and historical ROAS stays understated. Treat the deploy date as a reporting break.

- [x] **A-7** — Embedded checkout fired Purchase with no event ID. **Closed in `c967faa`, verified 2026-08-16.**
 -> REQ: REQ-50, REQ-55 · The parent listener that fired Meta `Purchase`, a Google `conversion` and TikTok `CompletePayment` on a positive total alone — unqualified, pre-payment, no `event_id` — was removed. Embed snippets now carry no conversion tracking at all, which is the correct answer: the embed sits on a third-party page, has no order number at redirect time, and cannot reach D1, so it can never qualify a purchase. `src/lib/embed-markup.test.ts` asserts every generated snippet is free of `fbq`/`ttq`/`gtag`/`dataLayer`.
 · Also fixed while verifying: `public/adsbook-form-widget.js` relayed `AddToCart`/`InitiateCheckout` to the parent pixel with `eventID` omitted when absent, so a merchant page carrying the store's pixel double-counted one event down the funnel. It now relays nothing without an id.

## A2 — Installer foundation

- [x] **A-10** — Make store identity resolve at runtime. **Done 2026-08-16.**
 -> REQ: REQ-7 · gap: G1 · ADR-003 · Migration `0036` adds eight nullable identity columns to `stores` (`site_url`, `description`, `logo`, `tagline`, `theme_color`, `locale`, `storefront_template`, `admin_name`; `name` and `slug` already existed). `src/lib/tenant.ts` became a resolver — database, then environment, then product default, per field — and `src/middleware.ts` resolves it once per request onto `Astro.locals.tenant`. All 36 consumers migrated: 30 `.astro`, 4 endpoints binding from `locals`, and `tenant-content.ts` whose `DEFAULT_HOME_CONTENT` became `buildDefaultHomeContent(tenant)`.
 · **Renaming the store in `/admin/settings/store` now changes the storefront with no rebuild** — `save-store` writes `stores.name`, which the resolver reads. That was the requirement.
 · A NULL column means "not configured here", so an install that predates `0036` keeps rendering from its environment unchanged, and a database with no row at all still renders — which is what a fresh install is before the wizard runs.
 · `storefrontTemplate` no longer throws on an unknown value. It used to throw at module load, which in a Worker meant every route returned 500; now that an operator can type the value, it degrades to the default and logs `tenant-unknown-storefront-template`.
 · 6 tests in `src/lib/tenant.test.ts` cover precedence, blank-as-unset, every validator degrading rather than throwing, a missing table, a failing database, and the frozen result.
 · **Closed 2026-08-16:** all of it is now editable from `/admin/settings/store` — address, tagline, description, logo and storefront template alongside the name. A blank field clears the column to NULL, which the resolver reads as "not configured here" and falls back for, so clearing is a real action rather than a way to store an empty name. `site_url` is validated as https and the template against the known set, both server-side.


- [x] **A-11** — First-run `/install` wizard. **Done 2026-08-16.**
 -> REQ: REQ-6 · gap: G2 · ADR-004 · deps: [A-10] · A migrated database with no `stores` row is now routed to `/install`, which collects store name, address, support number, admin credential and template, writes them, and disappears.
 · **The uninstalled signal costs nothing.** No migration inserts a `stores` row, so its absence is exactly "migrated but never set up" — and middleware already read that row every request to resolve identity. `readStoreIdentity` returns three states instead of two, so the gate is free.
 · **`unknown` never redirects.** A database that fails to read is not an empty one; conflating them would send a live store to its own installer on a transient fault.
 · Writes go through `batch()` so identity and credential land together — a half-installed store is worse than one that refused, because the operator cannot tell which half took. The insert carries `WHERE NOT EXISTS`, so two simultaneous submissions cannot both win.
 · Once installed the wizard redirects to `/hello` for good: it is the one unauthenticated write in the product and must not linger as a re-runnable surface.
 · The page imports no layout, deliberately — every layout resolves store identity, and on this page there is no store yet.
 · Verified end to end against a real SQLite built from the migration chain: fresh database reports uninstalled; install writes the store, rotates the credential, and the chosen password verifies against the stored hash; a second attempt is refused with one store still present.

- [~] **A-12a** — Stop inheriting marketing copy on missing home content (`src/lib/tenant-content.ts`). **Done 2026-08-16.**
 -> REQ: REQ-13 · gap: G5 · ADR-007 · Done when: the fallback carries only this store's own identity and generic section labels, never marketing claims; the unpublished path and the missing-binding path each log a distinct label so a degraded render is visible in logs. A D1 query failure was already logged separately as `storefront-home-content-load`.
- [ ] **A-12b** — Render an explicit setup state instead of the structural shell.
 -> REQ: REQ-13 · gap: G5 · ADR-007 · deps: [A-12a] · Done when: an install with no published home row renders the setup state that already exists in `src/pages/index.astro`. `getTenantHomeContent` never returns `null`, so that branch is currently unreachable — the work is making the absence of a published row observable to the page, not deleting a symbol (`DEFAULT_HOME_CONTENT` is already gone; the fallback is `buildDefaultHomeContent`).
 · **Blocked on data, not code:** the reference install has no published `storefront_content` row, so flipping this today would replace a live storefront homepage with a setup notice. Publish home content from `/admin/content` first, then flip.
- [x] **A-13** — Schema version check. **Done 2026-08-16.**
 -> REQ: REQ-8 · gap: G3 · Done when: the applied migration count is compared with `CMS_VERSION.schemaVersion` and a mismatch is surfaced to the operator instead of failing at the first broken query.
- [x] **A-14** — Remove inert tenant machinery. **Done 2026-08-16.**
 -> REQ: REQ-1 · ADR-002 · Removed `CONTENT_PACK_IDS`, `TenantContentPackId`, `isTenantContentPackId`, the `contentPack` default, `PUBLIC_TENANT_SLUG`, `PUBLIC_CONTENT_PACK`, and the dead `CMSADS_TENANT_CONFIG` / `CMSADS_INSPECTOR_PORT` hooks in `astro.config.mjs`. `astro check` hints dropped 38 -> 36.

## A3 — Correctness and security

- [x] **A-20** — Test coverage for `src/lib/auth.ts`. **Done 2026-08-16.**
 -> REQ: REQ-60, REQ-61 · 12 tests in `src/lib/auth.test.ts` covering round-trip, wrong secret, six tampering shapes, validly-signed-but-hostile claims, lifetime and clock skew, 15 malformed inputs, exact cookie-name matching, credential-rotation invalidation driven through the real `onRequest`, cross-user session records, and the full role matrix including denied routes. Mutation-verified: five deliberate breaks in `auth.ts` were each caught.

- [x] **A-25** — Harden the authorisation policy in `src/lib/auth.ts`. **Fixes landed in `c967faa`; pinned by tests 2026-08-16.**
 -> REQ: REQ-61 · Four of the six findings were real and are fixed: deny-by-default for an unknown role, `admin` converted from a two-entry blacklist to an allowlist, `/api/admin` gated as an exact path as well as a prefix, and the double URL-decode removed.
 · Two were **rejected on inspection**: the `/admin` grant is not unconditional — it sits after the role check, and `/admin` renders nothing but a redirect; and `verifyJwt` does cap lifetime, rejecting `exp - iat > 24h`.
 · The gap that remained was that the tests did not actually pin the fixes. The deny-by-default assertion wrapped the call in `try/catch`, so it would have passed against the throwing version it existed to guard. That is fixed, and a new test walks `src/pages/admin/**` and `src/pages/api/admin/**` off disk and asserts every route on it is reachable by `owner` and `admin` — so an allowlist that goes stale fails the suite instead of silently locking an operator out of a page that exists.
 · Mutation-verified: six deliberate regressions, each caught.

- [x] **A-21** — Connect the headless origin allowlist to the admin (`src/lib/headless-api.ts`). **Done 2026-08-16.**
 -> REQ: REQ-71 · Done when: authorising a new storefront origin is an admin action rather than a code change and deploy; the currently undeclared `PUBLIC_HEADLESS_ALLOWED_ORIGINS` is either implemented or removed; the embed allowlist and the API allowlist have documented, distinct scopes.
- [x] **A-22** — Stop marking authenticated API responses publicly cacheable. **Done 2026-08-16.**
 -> REQ: REQ-71 · Done when: authenticated `/api/v1/*` 200s, including `/api/v1/storefront`, are not served with `public` cache directives that permit shared-cache storage.
- [x] **A-23** — Add CORS headers to headless error responses. **Done 2026-08-16.**
 -> REQ: REQ-70 · Done when: `headlessError` includes `Access-Control-Allow-Origin` so cross-origin callers can read error bodies.
- [x] **A-24** — Repair or retire the Drizzle layer. **Done 2026-08-16 — retired, not repaired.**
 -> ADR-005 · gap: G8 · Removed `schema.ts`, `src/db/index.ts`, `drizzle.config.ts`, all of `migrations/meta/`, both dependencies and the `db:generate` script. Repair was rejected on evidence: drizzle-kit's SQLite snapshots cannot represent the `product_variants_stock_nonnegative` trigger, so the first generated migration rebuilding that table would have silently dropped a data-integrity guarantee. The audit also found 6 of the 8 indexes declared in `schema.ts` existed in no migration at all, while 10 real indexes went undeclared.

## A4 — Consistency and hygiene

- [x] **A-37** — Fix unreachable controls in admin mobile card lists. **Done 2026-08-16.**
 -> REQ: REQ-62 · Reported symptom: on mobile, some menus and the row action ("Aksi") could not be tapped. Root cause was not pointer handling — the mobile card lists used `display: grid` with **no** `grid-template-columns`, so the implicit column was sized `auto`. A card's min-content width (set by the `truncate`/`white-space: nowrap` title and slug) then widened the column to 491px inside a 390px viewport, and the `overflow-hidden` wrapper clipped it, putting the status switch and the Aksi trigger off-screen with no way to scroll to them. Adding `grid-cols-1` (`minmax(0, 1fr)`) caps the column at the container width and lets `truncate` do its job. Applied to `ProductCatalog.tsx`, `OrdersTable.tsx`, `ShippingOperations.tsx`.
 · Verified in Chrome at 390x844 with touch emulation against the built Worker: overflowing elements on `/admin/products` went 400 -> 5, card width 491px -> 335px, and the Aksi menu opens with all five items hit-testing to themselves. On `/admin/orders` every remaining overflow sits inside a horizontally scrollable filter row, so nothing is clipped. `/admin/shipping` carries the identical change but was **not** exercised end to end — the local database has no shipments, so its mobile grid never rendered.

- [x] **A-30** — Unify checkout presentation. **Done 2026-08-16.**
 -> REQ: REQ-20 · The second style layer was **deleted** rather than extended: 110 lines of `:global([data-canonical-order-form])` in `GeoIpResolvedForm.astro` that repainted the base stylesheet. It could only ever reach six of the seven checkout routes, because `/hybrid-form` renders the content components directly and never sets that attribute — which is exactly why one checkout stayed green and orange. The base stylesheet now *is* the shipped palette, so there is no second declaration to win or lose.
 · Cascade proved rather than assumed: the submit button previously matched `.submit-main` (0,1,0) alone on `/hybrid-form` and `[data-canonical-order-form] .submit-main` (0,2,0) elsewhere. Built CSS now shows zero orange, zero green, and the champagne/ebony palette throughout.
 · **Three defects found that were not in the brief**, each affecting all seven routes rather than one: a filled-then-blurred float label stayed green because the override only handled `:focus`; `/hybrid-form`'s submit button had **no keyboard focus indicator at all**, since `:focus-visible` lived only in the deleted layer; and the disabled submit and address-picked card were slate and green because the override never covered them.
- [x] **A-31** — Stop shipping checkout CSS to the admin. **Done 2026-08-16.** The premise in this task was wrong: the five page-level imports were **not** no-ops — the build emitted `form-hybrid` twice — and the PDP and every landing page had no import at all, relying on the global one. Removing them as written would have unstyled all seven checkouts. Global import dropped, two missing imports added, 17.8 KB off all 28 admin routes and `/hello`.
 -> Done when: `form-hybrid.css` is imported only by the routes that need it; the five redundant page-level imports are removed.
- [x] **A-32** — Remove unused font payload. **Done 2026-08-16.**
 -> Two premises in this task were wrong, and checking them changed the work. Plus Jakarta Sans was never *downloaded* — `@fontsource` gates each `@font-face` behind `unicode-range`, so a family nothing uses is never fetched. The real cost was a **25,098-byte render-blocking stylesheet on `/embed/form` that was 100% Plus Jakarta Sans and matched nothing**. And Inter's weights were not being synthesised: CSS font matching resolves 500 to the loaded 400 and 800/900 to 700, so the selected face is already bold — the defect is hierarchy collapse, not smearing.
 · Removed the family and its dependency; corrected Cinzel from 600 to 700, which is what all four declaration sites actually ask for. Font assets in `dist` fell from 1,041,364 to 719,680 bytes.
 · Deliberately **not** done: adding Inter 500/800 would cost +48,672 bytes of render-blocking latin woff2 on the homepage, every product page and every landing page, to lift substitutions that already degrade gracefully. Costed and recorded in `BaseLayout.astro` rather than silently skipped.
- [x] **A-33** — Align `themeColor` with the shipped palette. **Done 2026-08-16.**
 -> REQ: REQ-7 · `PUBLIC_SITE_THEME_COLOR` and the code default are now `#111111` (ebony), verified baked into the build output. Also corrected a documentation error found while testing this: `wrangler.jsonc` vars *do* reach the bundle — they are read at build time, so a change needs a rebuild, not merely a redeploy.
- [x] **A-34** — Delete orphan components and stale artifacts. **Done 2026-08-16.**
 -> Removed: eight zero-importer components, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and the root `migrations/` duplicate. The root copy was not actually unreferenced — `src/lib/landing-pages.test.ts` read it to build its SQLite fixture; the fixture now points at the byte-identical `src/db/migrations/0027_landing_page_builder.sql`. ADR-009.
- [x] **A-35** — Fix `/solusi-terbaru` and the HTML sitemap. **Done 2026-08-16.**
 -> `/solusi-terbaru` now redirects to `/produk` instead of a slug with no route; `/sitemap` reads products and active landing pages from D1 like `/sitemap.xml` does.
- [x] **A-36** — Decide the fate of the `zanoby_*` cookie namespace. **Done 2026-08-16.**
 -> Renamed to `adsbook_click_ids` **with** a read-only fallback on the legacy name, so no in-flight attribution was lost. Delete the fallback once 90 days have passed since deploy. The session cookie moved to `adsbook_session` and the embed namespace to `adsbook:` in the same change.

- [x] **A-8** — Migrate the developer API key prefix off `cmsads_live_`. **Done 2026-08-16 — no migration needed, and that is the finding.** `key_hash` is a SHA-256 digest, so the prefix never took part in matching; rewriting it would have broken every live key. New keys carry `adsbook_live_`, old ones still validate, and the legacy prefix survives only in the mask. (`src/lib/developer-api-keys.ts`).
 -> REQ: REQ-71 · Done when: newly issued keys carry an AdsBookCMS prefix and previously issued keys still validate. The prefix is part of every stored and masked key, so this needs a dual-prefix read, not a rename.

- [x] **A-9** — Finish the brand sweep in the admin embed dialog. **Done 2026-08-16.**
 -> Done when: the `cmsads-order-form-<id>` embed id template and the four user-visible "CMSAds" strings match the snippet the dialog actually generates, which now emits `adsbook-*`.


- [x] **A-53** — Make a stale embed snippet detectable. **Done 2026-08-16.**
 -> REQ: REQ-50 · Every generated snippet now stamps `v=<EMBED_SNIPPET_VERSION>` onto the `/embed/form` URL. `src/pages/embed/form.astro` compares it and logs `embed-snippet-stale` with the parent origin, so Workers Logs shows both *that* a merchant page is stale and *how much live traffic* still runs it. An absent marker reads as version 1 — which is every snippet generated before this existed, including the pre-`c967faa` ones that fire an unqualified Purchase.
 · Only the referrer **origin** and two integers are logged; `new URL(referer).origin` drops the path and query, so nothing about a visitor is recorded.
 · Verified against a running dev server across four request shapes: current marker, no referrer, and same-origin referrer all log nothing; only a third-party referrer without a current marker logs.
 · Known blind spot: an HTTP merchant page sends no referrer to an HTTPS store, so it cannot be attributed.

- [x] **A-54** — Decide the fate of the `autoHeightIframe` snippet. **Deleted 2026-08-16.**
 -> **Correction:** this task previously claimed `autoHeightIframe` was the only variant forwarding click IDs, and that was wrong — I propagated it from an earlier report without checking. The `widget` variant forwards the same twelve keys, and additionally recovers `_fbp`/`_fbc` from parent cookies when they are absent from the URL. That is now pinned by a test asserting the mounted widget's real frame URL carries the tracking parameters, so the claim cannot rot again.
 · With that premise corrected the decision was straightforward: the widget is a strict superset — auto-height, origin-checked redirect, and an `event_id`-gated funnel relay the inline variant never had — and it is served by the store, so it heals on deploy. `autoHeightIframe` froze that logic onto a merchant page permanently, which is exactly the failure mode A-53 exists to detect. `buildParentListener()` went with it. `plainIframe` stays as the no-JavaScript option.
 · Deleting it removes only the ability to generate new ones. Snippets already pasted are unaffected and still need re-copying.

- [ ] **A-55** — Embedded checkouts may emit no Purchase at all.
 -> REQ: REQ-50 · The mirror of A-7, and under-reporting rather than over-reporting. `thanks_state` is the only carrier of `order_pk`/`status_token` and lives in `sessionStorage`. In an embed the form writes it from a partitioned third-party store-origin context; the parent then navigates top-level to store-origin `/thanks`, which reads the **unpartitioned** store. In a partitioning browser that state is gone, the thanks tracker returns early, and because the CAPI leg is only ever triggered by that browser post, the server never fires either. A fix needs a completion token in the URL, which `checkout-navigation.ts` deliberately forbids — so this is a product decision, not a patch.

- [x] **A-56** — Fresh installs could not be created at all. **Fixed 2026-08-16.** *(found while retiring Drizzle)*
 -> REQ: REQ-2 · Migration `0017` seeded a sample product with `INSERT INTO products … SELECT … FROM stores`, a no-op on the empty `stores` table of a new database, then inserted two variants with a hardcoded `product_id = 10001` — violating the foreign key and aborting the chain at migration 17 of 36. **No new install could get past it**, which is fatal for a product whose premise is installability. Reproduced independently in an isolated SQLite before fixing.
 · A forward migration cannot repair this, because `0017` fails before any later migration runs. `0017` was edited in place — the one documented exception — with the reasoning in its header: `0034` already deletes that row, so a migrated database and a fresh one converge on the same end state and the edit creates no divergence.
 · Verified: all 37 migrations apply from zero, producing 15 tables and no foreign sample product.

- [x] **A-57** — Two maintenance scripts point at a repository that no longer exists. **Deleted 2026-08-16.** Their inputs, their dependencies and the repository they pointed at were all gone, and their outputs matched nothing in the tree.
 -> `scripts/generate-logo-assets.cjs` and `scripts/generate-webp-logo.cjs` hardcode `projectRoot = '/home/ongki/Projects/cmsads'` and `require` sharp from that checkout's `node_modules`. That repository is gone. Both are unrunnable from this tree and would write into the wrong project if it returned. Done when: they resolve paths relative to this repository and take their dependency from it, or they are deleted. They also still emit `adscms-logo.*` filenames.

- [ ] **A-58** — Browser verification debt on two admin surfaces.
 -> `AGENTS.md` §1 requires opening a page for browser-visible changes. Two shipped changes have not had that: the schema-mismatch notice on `/admin/dashboard` (A-13) and the renamed embed-dialog strings (A-9). Both were verified statically only — build, typecheck, `astro check`, and for A-13 against the real local D1 — because the admin is behind auth and the tree was contended. Done when: both are seen rendered at a mobile and a desktop width.
 · Note the local D1 is 19 migrations behind the tree, so it needs migrating before it can serve a realistic admin session.

- [x] **A-59** — A fresh install could not be logged into. **Fixed 2026-08-16.**
 -> REQ: REQ-3 · LOGIN-1 · The seeded `admin` credential accepted only a password supplied through `BOOTSTRAP_ADMIN_PASSWORD`, and nothing sets that on a new Worker — so a new install had an admin account no password could open. This is the second install blocker found today, after the migration chain (A-56); together they meant the product could not be installed at all.
 · `admin` / `admin` now opens a fresh install. A configured `BOOTSTRAP_ADMIN_PASSWORD` still replaces the default entirely, and a value under 16 characters is rejected outright rather than degrading to it.
 · The exposure is bounded by middleware, not by convention: while `must_change_password` is set the session reaches only `/admin/profile`, `/api/admin/profile` and `/api/admin/logout`. It cannot read an order, a customer, a payment or a provider key.
 · This **reverses a deliberate hardening**. The test that encoded the old decision was rewritten rather than deleted, and carries the reason. `PRD-ADMIN-LOGIN.md` records the full trade.

- [~] **A-60** — Close the open admin-login requirements. **Six of seven done 2026-08-16; LOGIN-7 open.**
 -> `PRD-ADMIN-LOGIN.md` · Each of these was a real defect, not a checkbox:
 · **LOGIN-13** — the message was already generic but the **timing was not**. An unknown username returned immediately while a known one paid for PBKDF2, so a fast response meant "no such operator" — the limiter and the clock answered the question the message refused to. Every branch now performs one verification, and the rate-limit check moved ahead of the credential lookup. Measured over HTTP: unknown 188/193/272 ms, known 194/198/193 ms.
 · **LOGIN-19** — three buckets, keyed on the `username|ip` pair so knowing an operator's username cannot lock them out, spent only on failure so a correct password never costs an attempt. Accepted failure modes are documented in the module rather than hidden.
 · **LOGIN-15** — the submit button was 40 px, and `.admin-input-flat` drops to 14 px at ≥768 px, which is exactly where an iPad zooms on focus.
 · **LOGIN-17** — the in-flight lock survived a back/forward-cache restore, leaving the button disabled and the operator unable to log in.
 · **LOGIN-6** — the notice renders only while the default actually opens the account, built from the same constants, so it cannot advertise a credential that does not work.

- [x] **A-67** — The login screen shipped one store's brand and a third-party asset to every install. **Fixed 2026-08-16.**
 -> REQ: REQ-18 · LOGIN-18 · **I recorded LOGIN-18 as done before it was.** The vendor advertisement had indeed been replaced — but with the *reference store's* brand mark, which every install would then have worn on its login screen. Replacing one brand leak with another is not a fix, and writing the status from intent rather than from disk is how it survived.
 · Also removed: a Google Fonts stylesheet and two preconnects for a family the page never applied, which told a third party the address of every operator opening the admin for no rendering benefit; and `og:image`/`twitter:image` on **every** admin page, pointing at the same store-branded panel — an admin area is `noindex`, so a social card serves nothing and leaked identity everywhere.
 · The product default logo is now a neutral AdsBookCMS mark. Before this, an install that had not set its own logo wore the demo store's.

- [x] **A-61** — Ten admin controls were unreachable on a phone. **Fixed 2026-08-16.**
 -> REQ: REQ-62 · The same defect class as A-37, found across the admin by sweeping for it deliberately. Each was invisible to every static check and made a feature unusable rather than ugly.
 · `CrmActionGroup.tsx` had **inverted breakpoints** — `grid-cols-5` on mobile, `sm:grid-cols-2` on desktop. Five columns on a 360px phone against a ~74px min-content button that cannot shrink, overflowing ~80px into a `Card` whose `overflow-hidden` clipped the last CRM follow-up steps away entirely.
 · `/admin/settings/crm` — the save bar was `sticky bottom-3 z-10` under a `fixed bottom-0 z-40` mobile nav. "Simpan semua template" was completely covered, and the page had no other save path: **CRM templates could not be saved from a phone at all.**
 · `/admin/expeditions` — the live tariff table sat in an `overflow-hidden` wrapper, clipping the *Tarif* column, which is the entire output of the rate simulation.
 · `/admin/check` — both kecamatan autocompletes opened at `z-20` beneath the `z-40` nav, which also swallowed the taps.
 · Plus: resi copy button clipped out of its column, the permission matrix losing its right-hand role column, the 5kg presets pushed off-screen, the order header row overflowing, two modals with no scroll under an open keyboard, and a `90vh` dialog that overflows on iOS.

- [x] **A-62** — Tap targets, truncation and heading order across the admin. **Fixed 2026-08-16.**
 -> REQ: REQ-62 · Pagination links were 32×32 icons — the shell's 44px rule targets `button`, and shadcn renders them as `<a>`, so order paging on a phone had no compliant target. Same gap for the ten CRM step links, the back link on seven pages, and the all-menu sheet items, which are portalled outside `.admin-main` where no shell rule reaches. Payment channel switches had a 20×36px hit area — the enable/disable control for every channel.
 · Nine `truncate` declarations were inert because their wrapper lacked `min-w-0`: `white-space: nowrap` was setting the grid item's automatic minimum size, so long values widened cards instead of ellipsising.
 · Four heading-order skips corrected, all without visual change.

- [x] **A-63** — Two admin surfaces were desktop-only or lossy on mobile. **Fixed 2026-08-16.**
 -> REQ: REQ-62 · `LandingPageCatalog` now pairs a mobile card list with the untouched desktop table, matching the pattern its siblings already establish. Every desktop action is reachable: Preview and Edit as visible anchors, Duplikasi as a full-width button so its loading state is actually visible, Salin Link both as an icon button and in the menu, Hapus in the menu.
 · The layout defect is closed on both halves, which matters because closing only one is what let it recur: the track is capped by `grid-cols-1`, **and** the `<article>` itself carries `min-w-0`, removing the grid item's automatic minimum size. An inner `min-w-0` alone would not have held the action row on screen.
 · Tap targets are floored explicitly rather than left to the shell rule — that rule stops at 767px while the card list runs to 1023px, and it never reaches an `<a>` styled by `buttonVariants`, which is the same gap that left pagination at 32px.
 · `/admin/balance`'s mobile card now shows the provider transaction id and expiry its desktop row already had, with `break-all` so a long id wraps instead of pushing the status pill off screen.

- [x] **A-64** — Dialogs escape the mobile sizing net. **Fixed 2026-08-16.**
 -> REQ: REQ-62 · `body` carries `.admin-shell` even though the portal escapes `.admin-main`, so the net was cast at `.admin-shell [data-slot="dialog-content"]` without widening any other selector. Inputs and buttons inside any admin dialog now floor at 44px with 16px text, and the close button at 44×44. Verified from the compiled stylesheet that the rules land **inside** `@media (width<=767px)`, so desktop is untouched.
 · `ui/dialog.tsx` now carries a default `max-h-[calc(100dvh-2rem)] overflow-y-auto`, so a consumer can no longer forget one. `100dvh` rather than `vh`: on iOS `vh` resolves against the large viewport, so a centred panel overflows while the toolbar shows.
 · `AccessManager`'s two hand-rolled modals are plain `<div>`s: no Escape, no focus trap, no backdrop dismiss.

- [x] **A-65** — Latent instances of the unreachable-control defect. **Guarded 2026-08-16.**
 -> Replaced vigilance with a test. `src/lib/mobile-layout-guard.test.ts` walks every admin component and page and fails on a `grid` that declares no columns, because Tailwind's `grid-cols-*` expands to `repeat(n, minmax(0, 1fr))` and that `minmax(0, …)` is exactly what stops min-content from widening the track. It accepts columns declared through an inline style.
 · Mutation-verified: removing `grid-cols-1` from the product catalogue's mobile list — the original defect — fails the test and names the line. Eight further grids were made explicit while the guard was written.

- [x] **A-66** — Five page-level admin components emit no headings at all. **Fixed 2026-08-16.**
 -> `ContentWorkbench`, `HeadlessApiManagement`, `SellerBankAccounts`, `OperationalHealth`, and `AnalyticsDashboard`'s success branch. Every visual heading is a `CardTitle`, which shadcn renders as a `<div>`, so those pages contribute nothing to the document outline below the topbar `h1` — a screen-reader user cannot navigate them by heading.

- [x] **A-68** — A fresh install could be completed and then not logged into. **Fixed 2026-08-16.**
 -> REQ: REQ-3 · LOGIN-1 · The login route needs `AUTH_SECRET` at 32 characters or more to sign a session and returns 503 without it, but the wizard never checked. An operator could complete the install and be locked out of the store they had just created, with no indication why. This is the **fourth** install blocker found, after the migration chain, the unopenable credential, and the missing store row — each was hidden behind the one before it.
 · `/api/install` now checks before writing anything and names the exact command to run. Refusing costs a retry; refusing after the write costs an install nobody can enter.
 · **Found by running the built Worker against a real empty database over HTTP** — no unit test would have caught it, because every unit test supplies its own secret.

- [x] **A-69** — An unmigrated database served a placeholder storefront with a 200. **Fixed 2026-08-16.**
 -> REQ: REQ-2 · `readStoreIdentity` folded "the `stores` table does not exist" into `unknown`, and `unknown` deliberately never redirects so a transient fault cannot send a live store to its own installer. But a missing table is neither a fault nor transient — it means the migration chain was never applied, and treating the two alike meant a Worker pointed at an empty database rendered a working-looking store with fallback identity and told nobody.
 · There is now a fourth state, `unmigrated`, matched on the SQLite message rather than an error code D1 does not expose. It routes to `/install`, where the operator gets an accurate message. Genuine faults still do not redirect.
 · Found by accident: a migration command was cut short during live testing, producing exactly this state.

- [x] **A-70** — Every fresh store announced itself as "not configured". **Fixed 2026-08-16.**
 -> The `wrangler.jsonc` template shipped `PUBLIC_SITE_TAGLINE: "Belum Dikonfigurasi"`, and the wizard collected no tagline — so a store's `<title>` read *"Toko Anda — Belum Dikonfigurasi"* on every page from the moment it went live. My own defect, introduced when writing the template. The template value is now empty, and the wizard collects an optional tagline.

## A5 — Operability

- [x] **A-40** — Enable Workers Logs. **Done 2026-08-16.**
 -> REQ: REQ-82 · gap: G7 · `wrangler.jsonc` declares `observability: { enabled: true, head_sampling_rate: 1 }`, validated against the wrangler config schema and a `--dry-run`. Takes effect on the next deploy.
- [x] **A-41** — Log degradation paths. **Done 2026-08-16.**
 -> REQ: REQ-82 · Done when: every silent fallback listed in `OBSERVABILITY.md` §3 emits a labelled warning distinguishing degraded operation from success.
- [x] **A-42** — Surface outbox and provider health in `/admin`. **Done 2026-08-16.** Verdicts come from recorded outcomes rather than clock thresholds, so a store doing two orders a week does not show red every Tuesday, and *unknown* is kept distinct from *degraded* — a provider never contacted is not one that failed. Each read is windowed to the newest 200 rows with the ceiling and upgrade path noted inline.
 -> REQ: REQ-82 · Done when: undelivered `capi_event_outbox` depth, last successful Mengantar call, last AutoLaris callback, and last CAPI delivery are visible to the operator.
- [x] **A-43** — Reconcile the version registries. **Done 2026-08-16.**
 -> REQ: REQ-83 · `package.json` is now `adsbookcms@1.2.0`, matching `src/lib/version.ts`.

## A6 — Install topology *(opened 2026-08-16, pending decision)*

- [ ] **A-50** — Decide how a second install is created and kept current.
 -> REQ: REQ-1, REQ-6 · deps: [A-10] · Done when: one mechanism is chosen, recorded as an ADR, and documented in `INSTALLATION.md` §10. The three real options, with the trade already understood:
 · **repo per install** (today, ADR-012) — maximum isolation, maximum drift; every install upgraded by hand.
 · **one config file per install inside the product repo** (`wrangler deploy --config installs/<slug>.jsonc`) — least drift, but store configuration re-enters the product repository, which is precisely how another merchant's content once reached a live storefront.
 · **`env.<slug>` blocks in one config** — what the upstream engine did. Same drift profile as the previous option, with a smaller surface.
 · **A-10 has landed**, so the blocking condition is gone: identity is no longer in the bundle, one build can serve every install, and the shared-repo option can now be compared on its merits rather than against a handicap. This is the next decision in Phase A.

- [~] **A-51** — Define how an install receives product updates. **Procedure written 2026-08-16; automation still open.**
 -> deps: [A-50] · `RELEASE.md` §7 now documents the merge-then-deploy procedure, its ordering constraints, and the `merge=keepours` driver that protects an install's `wrangler.jsonc` and deploy workflow from being overwritten by the product's placeholders. Still open: nothing verifies an install actually ran it, and nothing reports which product version an install is on. Done when an install's version is discoverable and drift is detectable without opening its repository.

- [ ] **A-52** — Decide whether the product ships as a package.
 -> deps: [A-50] · Done when: either the product is published as an installable artifact so installs depend on a version rather than copying a tree, or the idea is recorded as rejected with its reason. This is what would make "one product, many installs" true rather than aspirational.

---

## Phase A — added 2026-08-17

Found by an adversarial audit of the install and auth paths against the built
Worker, and by reading the emitted stylesheets rather than the source.

- [x] **A-68b** — The admin gate read the raw request path while Astro routed on a normalized one. **Done 2026-08-17.**
 -> gap: — · ADR-013 · `//api/admin/settings` returned 200 with provider settings and no cookie; a cross-site `PUT` on the same path rewrote the courier API key. `src/middleware.ts` now derives every path decision from `context.url`. Pinned by `middleware-path-source.test.ts` and by `auth.test.ts`, whose harness previously supplied only `request` — which is why this passed CI. Verified before and after against `wrangler dev` on a real installed D1.

- [x] **A-72** — The installer's credential write was unguarded, so a second submission took the admin account. **Done 2026-08-17.**
 -> REQ: REQ-6 · A zero-row `INSERT` is not an error, so D1 kept the batch: the second caller was told "already installed" and had just replaced the operator's username and password. `hashAdminPassword` parks every request in ~100ms of PBKDF2 before the write, so an attacker polling an un-installed Worker owns the store the moment its operator installs it. The credential `UPDATE` now carries `AND must_change_password = 1` — order-independent, claimable once — and `runInstall` refuses outright when no credential row exists rather than writing a store with no admin. Reproduced and pinned in `install.test.ts` against real SQLite.

- [x] **A-73** — Anyone knowing the admin username could lock the operator out. **Done 2026-08-17.**
 -> ADR-014 · Ten addresses × the 5-per-pair allowance is exactly the 50 identifier ceiling, so sixty requests denied the real operator, with the correct password, from a clean address — repeatable indefinitely. The identifier bucket now denies only an address that has itself failed for that account.

- [x] **A-74** — `robots.txt` told Google nothing and shipped the demo store's sitemap. **Done 2026-08-17.**
 -> Per RFC 9309 a crawler obeys only its most specific matching group; the named groups held nothing but `Allow: /`, so six crawlers saw no disallows and `/admin` and `/hello` were fair game. It also carried `Sitemap: <demo domain>`. Now served from `src/pages/robots.txt.ts` against the store's own identity, with the disallow list repeated in every group.

- [x] **A-75** — Reference-store branding was still shipping on three surfaces. **Done 2026-08-17.**
 -> The storefront wordmark was the demo name in literal text while its own `aria-label` resolved correctly; the favicon every admin page and the login screen load spelled it out in two 62px words; and the Google/Meta ads pages printed the demo store's feed URLs for the operator to register. All now resolve from identity, and `brand-contamination.test.ts` fails the build if any of it returns.

- [x] **A-76** — 27 routes asked for Inter and loaded no font faces at all. **Done 2026-08-17.**
 -> The `@fontsource` imports lived in `BaseLayout`, so all 23 `@font-face` rules landed in that layout's stylesheet. The 26 admin routes, `/hello` and `/embed/form` load `global.css` and never that one, while `global.css` names Inter for `body` and `.admin-shell` — the entire operator UI, plus the checkout merchants iframe onto their own pages, silently rendered in `system-ui`. Faces moved to `global.css`; the 400/600/700 ramp is unchanged (A-32).

- [x] **A-77** — The mobile grid guard passed the defect it exists to stop. **Done 2026-08-17.**
 -> It accepted `grid-cols-*` "at any breakpoint prefix", so `grid gap-3 sm:grid-cols-2` — which below `sm` has no `grid-template-columns` at all — was green, and 48 live admin grids matched that shape. It also read only double-quoted `class` attributes, missing `cn()`, template literals, single-quoted Astro attributes and `class:list`: six of seven spellings. Guard rewritten and mutation-verified against all seven; the 48 grids given an explicit mobile column; scope widened to `src/components/ui` and `src/layouts`.

- [x] **A-78** — Three holes in the mobile tap-target net. **Done 2026-08-17.**
 -> An `<a class="h-8">` inside the very dialog the net was written for (anchors were not in any selector); `sheet-content`, which portals exactly as dialogs do and carries the mobile menu and search; and portaled `select-item` / `dropdown-menu-item` / `command-item` rows at ~28px across seven admin components.

- [x] **A-79** — A fresh store described itself to customers as unconfigured. **Done 2026-08-17.**
 -> Same defect as A-70, one field over: `PUBLIC_SITE_DESCRIPTION` shipped `"Belum dikonfigurasi."`, which becomes the meta description Google prints under the store and the second half of the home page `<title>`. Both the template value and the code default are now empty, and the resolver composes a plain sentence from the store's own name.

- [ ] **A-71** — Make the login brake exact under concurrency.
 -> ADR-014 · `checkRateLimit` is a non-atomic KV get-then-put, so N simultaneous guesses read the same count and spend one slot between them: measured, 50 parallel wrong passwords cost 1 of a 5-attempt bucket. It damps sequential credential stuffing, not parallel. Done when the pair bucket is exact under concurrency — which means a Durable Object, since Workers KV has no atomic increment.

- [ ] **A-80** — See the admin rendered in a browser.
 -> deps: [A-58] · Everything in A-76, A-77 and A-78 is a cascade change reasoned from the built stylesheet, not from pixels. Not established: that the 44px floors do not break a compact row, that growing `dialog-close` to 44×44 under `absolute top-2 right-2` clears the header in `OrderDetail`'s `p-0` dialog, or that admin reads acceptably now that it renders in Inter rather than the platform's `system-ui`. Done when the admin has been opened at 320px, 390px and desktop.

- [x] **A-81** — Catalog id, pixel `content_ids` and feed `<g:id>` were three different values. **Done 2026-08-17.**
 -> ADR-015 · The feed published `10000 + row id`, the admin showed that, the Pixel sent the raw row id. Advantage+ and DPA matched nothing, silently, while the merchant paid for the traffic. Now `p{product}-v{variant}` everywhere, derived from the AUTOINCREMENT keys rather than the editable SKU. Also fixed in the same pass: the first variant of a multi-variant product was published without `item_group_id` (group of one, orphan id colliding with the group id), and the group carried no variant attribute, which Google requires. Verified live against `wrangler dev`: feed, product page, checkout with an explicit variant, and `/api/form-config` all emit the same strings. Pinned by `catalog-identity.test.ts`, which checks the two halves against each other rather than against a fixture — a fixture is how three values passed CI.

- [ ] **A-82** — Give `product_variants` a variant axis.
 -> deps: [A-81] · Every variant label ships to Google as `g:size` whatever it really is, because the row records one free-text label ("30ml", "Merah", "isi 2") and nothing that says which attribute it varies. Google treats size as free text, so this is imprecise rather than invalid. Done when a colour variant ships as `g:color` and a size variant as `g:size`, chosen from stored data rather than guessed from the string.

- [x] **A-83** — 12 MB of a former merchant's assets, and their wordmark, shipped in every install. **Done 2026-08-17.**
 -> Found while verifying the history rewrite: the rewrite dropped the old *history*, but `public/images/` still carried the assets in the **current** tree. 500 files (`produk/`, plus 15 top-level product directories) referenced by nothing at all — no code, no seed, no migration, no content. And `logo.webp` was the demo store's wordmark, hardcoded in eight places including `AdminShell`, `AppSidebar` and `/thanks`, and named by `wrangler.jsonc` as `PUBLIC_SITE_LOGO` — so every install's admin chrome and confirmation page wore another merchant's brand. Sixth surface of the LOGIN-10 defect, and invisible to `brand-contamination.test.ts` because a `.webp` carries no matchable text. The logo now flows from `Astro.locals.tenant.logo` through the existing identity chain; product-owned fallbacks use the neutral mark. `public/images` 21 MB → 9.1 MB.

- [x] **A-84** — A missing image answered 302 to the login screen instead of 404. **Done 2026-08-17.**
 -> `isInstallerPath` covers `/images/`, `/_astro/` and the favicons so the wizard can render before a store exists. It was reused for the installed case, so on a live store any request for an absent asset redirected to `/hello` — an `<img>` receiving an HTML login page. Split into `isInstallerRoute` (the wizard's own routes, used when installed) and `isInstallerPath` (routes plus assets, used only when uninstalled). Verified live: absent images now 404, `/install` still 302s on an installed store.

- [x] **A-85** — Ship an empty CMS: remove the bundled catalogue. **Done 2026-08-17.**
 -> ADR-016 · `scripts/seed-catalog.sql`, `public/images/products/` (22 products, 110 variants, 8.9MB) and `db:reset:demo:local` removed. Verified first on a migrated, installed, product-free database that the empty states already existed and read well — `/produk` "Katalog sedang disiapkan", `/kontak` "Kontak Belum Tersedia", valid empty catalog XML, every route 200 — so nothing broke by having nothing. The home page then gained the empty state its siblings had: the product grid, the search box and the "0 dari 0" counter are `hidden` when there is nothing to count. `public/images` 21MB → 232KB across this and A-83. Whether to reintroduce sample data, and in what form, is deferred — not decided against.

- [x] **A-86** — The ad taxonomy defaulted every unclassified product to Handbags. **Done 2026-08-17.**
 -> Fallout of A-85, and the reason it could not be a pure deletion. `DEFAULT_TAXONOMY` was Google category `6551`, justified in its own comment as "at least a category this catalog sells". With no catalogue that premise is false, and the default would have submitted every unclassified product in every store to Merchant Center as a handbag — the exact misrepresentation the adjacent comment warns about. `getAdTaxonomy` now returns no category when no rule reaches the confidence bar, and both feeds omit `google_product_category` / `fb_product_category` rather than assert one. Both fields are optional and Google auto-classifies what is missing. The scoring rules are unchanged; only the fallback is.

- [ ] **A-87** — Let a merchant tell the taxonomy engine what they sell.
 -> deps: [A-86] · The keyword rules are inherited from earlier merchants and match no particular install. A product now falls through to no category rather than a wrong one, which is safe but leaves Merchant Center auto-classifying. Done when a store can set its own category mapping from `/admin`, or confirm the engine's guess, instead of the engine inferring from Indonesian keyword lists that predate it.
