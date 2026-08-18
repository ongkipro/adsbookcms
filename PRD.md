# PRD — AdsBookCMS (single)

> Last executed baseline: 2026-08-17 @ `5cb1d32` + the A13 working tree.

## 0. About this document

AdsBookCMS is a direct-response commerce CMS that installs onto Cloudflare Workers. **One installer run produces one Worker, one database, one store.**

The previous version of this document specified a multi-tenant engine with a provisioning installer, a tenant registry, and fleet deployment — none of which exists in this repository. It also defined three requirement IDs twice with different text, and mandated behaviour (`admin`/`admin` login) that the code was deliberately hardened against.

Requirement numbering therefore **restarts** here. The old `REQ-*`, `SEC-*`, `PAY-*`, `ORD-*`, `TRK-*`, `UI-*` identifiers referenced by `TASKS.md` do not resolve to this document and should not be reintroduced.

Each requirement carries a status:

- **Implemented** — covered by the last executed repository baseline or later evidence named in the row
- **Partial** — works, with a stated limitation
- **Accepted** — decided product behavior; the row states whether source is visible, while execution remains unclaimed until evidence exists
- **Planned** — decided backlog behavior not yet built

---

## 1. Product definition

AdsBookCMS gives one merchant a complete direct-response storefront: catalog, landing pages, checkout with cash-on-delivery and online payment, order and shipping operations against an Indonesian 3PL aggregator, ad-signal tracking for Meta and Google, and an admin dashboard — deployed as a single Cloudflare Worker the merchant owns.

**Goals**
1. A merchant can install, configure, and operate a store without a developer after the first deploy.
2. The install is isolated: its own Worker, database, media bucket, domain, and credentials.
3. Commerce truth is server-side. Browser state never determines price, stock, or eligibility.
4. Ad platforms receive accurate, deduplicated conversion signals.

**Non-goals**
1. Multi-store operation inside one Worker (ADR-001).
2. Customer-authored code or a plugin runtime.
3. Public self-service signup.
4. Marketplace features — multi-seller, bidding, escrow.

---

## 2. Installation and configuration

| ID | Requirement | Status |
| --- | --- | --- |
| REQ-1 | The system shall run as a single Cloudflare Worker with bindings `OMS_DB` (D1), `SESSION` (KV), `ASSET_BUCKET` (R2), `AI`, and `ASSETS`, with binding names identical across every install. | Implemented |
| REQ-2 | The system shall treat `src/db/migrations/` as the sole schema truth and shall apply the checked-in chain automatically before serving database-backed requests; `wrangler d1 migrations apply` remains an optional operator preflight. | Implemented 2026-08-17 |
| REQ-3 | The system shall create a bootstrap administrator credential with `must_change_password` set, openable on a fresh install without any environment configuration, and shall confine that session to replacing its own password. | Implemented — **revised 2026-08-16.** This previously required *rejecting* the default password, which made a new install unreachable: the only accepted password came from `BOOTSTRAP_ADMIN_PASSWORD`, which nothing sets on a new Worker. See `PRD-ADMIN-LOGIN.md` |
| REQ-4 | Where a provider credential exists both in the database and in the environment, the system shall prefer the database value and shall report which source is active. | Implemented |
| REQ-5 | The system shall never return a stored secret through a browser-facing API; masked previews only. | Implemented |
| REQ-6 | When the database has not been initialised, the system shall present a first-run install wizard that collects store identity, administrator credentials, and locale, writes them to D1, and refuses to run again once complete. | Implemented 2026-08-16 |
| REQ-7 | Store identity — name, canonical URL, description, logo, tagline, theme colour, locale, storefront template — shall resolve at runtime from D1 so that changing it requires no rebuild. | Implemented 2026-08-16 for resolution. Six fields have an admin editor at `/admin/settings/store` — name, canonical URL, description, tagline, logo, storefront template. `theme_color`, `locale` and `admin_name` resolve at runtime but have no editor; `theme_color` is not collected by the wizard either |
| REQ-8 | Before serving a database-backed request, the system shall compare applied history with the code's migration chain, atomically apply a valid missing suffix, and fail closed on invalid, unknown, or ahead history. | Implemented 2026-08-17 — G3 |
| REQ-9 | A fresh install shall contain no data belonging to any other merchant, and any sample record it ships shall be neutral, clearly labelled, and deletable. | Implemented — and stronger than required: **no sample record ships at all** (ADR-016). Migration `0034` removes the inherited row; the bundled catalogue and its photography were deleted 2026-08-17 |

---

## 3. Storefront

| ID | Requirement | Status |
| --- | --- | --- |
| REQ-10 | Every route shall be server-rendered; no route is prerendered. | Implemented |
| REQ-11 | The storefront shall render product identity, price, stock, and weight from D1, never from compiled code or browser state. | Implemented |
| REQ-12 | A product without published presentation content shall be rendered from its own catalog data — title, category, variants, price — and never with copy belonging to another product or another merchant. | Implemented — note this is the **opposite** of omission. `mergeRuntimeProductContent` drops unpublished products, then `mergeStorefrontCatalog` re-adds every active row with a neutral description derived from that product's own title and category. A merchant who adds a product sees it on the storefront immediately instead of it being invisible until they write copy |
| REQ-13 | Where published home content is absent, the storefront shall render an explicit setup state and shall not fall back to generated or compiled merchant-facing copy. | Implemented 2026-08-17 — G5, ADR-007 |
| REQ-14 | The system shall offer selectable storefront templates, and the available set shall be extensible without a rebuild. | Implemented 2026-08-17 — two built-in runtime definitions plus operator-created D1 definitions (G6) |
| REQ-15 | The system shall emit `sitemap.xml`, `robots.txt`, Google Merchant and Meta catalog feeds, and JSON-LD for Organization, WebSite, Product, ItemList, and Breadcrumb. | Implemented |
| REQ-16 | The system shall not emit aggregate ratings, review counts, or sold counts that are not derived from real recorded data. | Implemented — the synthetic review, rating, sold-count and compare-price generators were removed on 2026-08-16; these fields are published through `/admin/content` or absent, and consumers already omit the rating block, review section and JSON-LD `aggregateRating` when they are |
| REQ-17 | Landing pages shall be composed from ordered sections stored in D1, editable in the admin, and reachable at the site root by slug. | Implemented |
| REQ-18 | Legal and contact pages shall render the installed store's own identity and contact details, never another merchant's. | Implemented |

---

## 4. Checkout and orders

| ID | Requirement | Status |
| --- | --- | --- |
| REQ-20 | The system shall offer hybrid, middle, and full checkout forms, plus a geo-resolved entry and a cross-origin embed. | Implemented |
| REQ-21 | COD eligibility shall be resolved from trusted edge geo against store-level province exclusions, with courier-level exclusions kept separate. | Implemented |
| REQ-22 | An unknown or excluded province shall route the visitor to the full form; a known eligible province shall route to the middle form. | Implemented |
| REQ-23 | Order submission shall persist order, items, and stock reservation atomically, and shall be idempotent under a submission token. | Implemented |
| REQ-24 | Stock shall never go negative; the constraint shall be enforced by the database. | Implemented |
| REQ-25 | Checkout shall persist the order and reserve stock without creating a Mengantar shipment. The pending order shall remain visible in Order Management until an operator explicitly chooses Push/Arrange Shipping. | Implemented 2026-08-18 — checkout-to-provider side effects removed and route contracts passed |
| REQ-26 | An authenticated, idempotent payment confirmation for a non-COD order shall mark payment paid without creating a Mengantar shipment. Confirmation changes dispatch eligibility only; shipping remains pending until explicit operator release. Manual seller-bank transfers are excluded from AutoLaris reconciliation. | Implemented 2026-08-18 — reconciliation and provider-call contracts passed |
| REQ-27 | A qualified but unsubmitted checkout shall be recorded as a **Pesanan tertinggal** lead, never included in the operational Order list, order summaries, or shipping queues. The dedicated lead workspace shall show the captured product, customer name, WhatsApp number, and follow-up state. | Implemented 2026-08-18 — dedicated queue, authorization, and order-list exclusion contracts passed |
| REQ-28 | Order submission shall be rate-limited and honeypot-guarded. | Implemented |
| REQ-29 | A qualified but unsubmitted lead shall be captured at most once for the same normalized name, WhatsApp number, and product/variant selection in one browser session. Successful fingerprints shall remain in the session set so any prior identical combination is suppressed, while a changed qualified combination may capture; a fingerprint shall be added only after capture succeeds, so a failed capture or unavailable browser storage remains retryable and never blocks capture. A storefront checkout or an explicit CS conversion shall promote the lead to one complete pending order instead of creating a duplicate. CS conversion shall require current D1 product/variant, stock, customer, destination, courier, and pricing data; it shall reserve stock exactly once and shall never dispatch to Mengantar. | Implemented 2026-08-18 — guarded ABN-to-INV conversion and concurrency contracts passed |

---

## 5. Payments

| ID | Requirement | Status |
| --- | --- | --- |
| REQ-30 | The system shall support cash on delivery, manual bank transfer against configured seller accounts, and online payment through AutoLaris (QRIS and virtual accounts). Online checkout shall create exactly one AutoLaris provider order through `POST /api/h2h/submit`, use the provider's exact `courir_id` spelling with the operationally assigned value `1`, source shipping/customer/item facts from D1, and fail before the provider request when those facts are incomplete. It shall not call the standalone `/api/h2h/create_payment` path. | Implemented 2026-08-18 — exact mocked outbound contract and D1 orchestration passed |
| REQ-31 | Fee bearer shall be configurable independently for payment fees and COD fees. | Implemented |
| REQ-32 | Payment channels shall be individually toggleable by the operator. | Implemented |
| REQ-33 | The payment instruction page shall show only recorded amounts and instructions, with copy-to-clipboard, expiry countdown, and automatic status polling. | Implemented |
| REQ-34 | Until AutoLaris publishes an authoritative transaction-inquiry contract, only an authenticated owner/admin may manually confirm an AutoLaris payment after checking the provider dashboard. Confirmation shall require exact re-entry of the recorded billed total and provider reference, explicit acknowledgement, and an operator note; atomically append immutable audit evidence and mark the payment/order paid; reject released-stock, cancelled, refunded, mismatched, or stale objects; remain idempotent under retries; never call a provider or dispatch shipment; and become visible to the buyer's existing status polling so `/payment` redirects to `/thanks`. The pending-verification queue may refresh once per minute and flag overdue records, but no timer or cron may infer `paid`. | Implemented locally 2026-08-18 — awaiting final A17 evidence reconciliation |
| REQ-35 | The balance view shall present recorded reconciliation only, and shall not claim to be a live or withdrawable provider wallet. | Implemented |
| REQ-36 | Every submitted non-COD checkout shall persist a normal pending order before payment is completed. Pending, failed, cancelled, or expired VA, QRIS, and bank-transfer payment states shall remain order states and shall never be reclassified as abandoned capture. | Implemented 2026-08-17 — full-funnel regression passed |

---

## 6. Shipping and fulfilment

| ID | Requirement | Status |
| --- | --- | --- |
| REQ-40 | The system shall quote live courier rates for the resolved destination, filtered by courier availability and COD rules. A fresh install shall start with the neutral courier catalogue, while upgrades shall backfill it only for stores whose courier policy is completely empty. | Implemented 2026-08-18 — fresh install and empty-policy repair contracts passed |
| REQ-41 | Destination resolution shall use a local district index with provider address search as a fallback. | Implemented |
| REQ-42 | Dispatch shall run sequentially under a single-flight lease and shall return independent per-order results. | Implemented |
| REQ-43 | Only an accepted provider response shall advance an order to processing; failures shall remain pending and retryable. | Implemented |
| REQ-44 | Pickup address and pickup schedule shall be synchronised with the provider before being presented as confirmed. | Implemented |
| REQ-45 | The operator shall be able to recover an accepted but unpaid non-COD shipment. | Partial — transport implemented and tested; no operator UI |
| REQ-46 | Shipment tracking state shall be synchronised from the provider. | Implemented 2026-08-17 — explicit operator polling by waybill persists raw provider evidence and advances only monotonic local lifecycle states |
| REQ-47 | One shared server-side dispatch flow shall run only after an explicit authenticated operator action. It shall recheck payment, pending shipping state, warehouse, destination, courier, and the dispatch claim before and after the provider request; suppress duplicates; persist only accepted provider identity/waybill; and never resurrect an order cancelled or edited during the request. | Implemented 2026-08-18 — explicit single/bulk dispatch and concurrency contracts passed |
| REQ-48 | The Shipping workspace shall expose exactly four count-bearing operational queues named **Semua Pengiriman**, **Perlu Dibuatkan Resi**, **Perlu Pickup**, and **Sampai Tujuan**, each with a distinct accessible icon, the order facts needed for that state, and only state-valid actions on desktop and mobile. **Perlu Dibuatkan Resi** shall include provider-created unpaid drafts that have no cnote; eligible pending orders not yet pushed to Mengantar shall remain visible and retryable from Order Management. Queue visibility does not imply that `/order/pay-unpaid` recovery is implemented. | Implemented 2026-08-17 — queue contracts and Chromium at 390, 768, and 1280 CSS px passed |

---

## 7. Ad signals

| ID | Requirement | Status |
| --- | --- | --- |
| REQ-50 | Browser and server Purchase events shall share one per-order event id and the same canonical Product ID so the platform deduplicates them. | Implemented — both legs share the verified `INV-` order number and send the numeric Product ID published by the catalog feeds |
| REQ-51 | Server-side conversion delivery shall be durable, with retry and attempt accounting, and shall survive a failed outbound call. | Implemented |
| REQ-52 | CAPI tokens shall remain server-side and shall never reach the browser. | Implemented |
| REQ-53 | The system shall capture and preserve `gclid`, `gbraid`, `wbraid`, `fbclid`, and `ttclid` from landing through order persistence. | Implemented |
| REQ-54 | Google Consent Mode shall default to denied in regulated regions before the granted default is applied. | Implemented |
| REQ-55 | A page interaction or an unqualified order shall never be reported as a Purchase. | Implemented |
| REQ-56 | Product category taxonomy in the catalog feeds shall resolve to the correct Google product category for each item. | Partial — matching is deterministic and confidence-gated (whole words, 3× name weighting, capped description contribution, unique winner); what remains is a compiled nine-rule set with no merchant-managed mapping or confirmation workflow |
| REQ-57 | Product ID, public API `content_id`, Meta Pixel/CAPI `content_ids`, Google ecommerce `item_id`, and `<g:id>` in both catalog feeds shall be the same decimal Product ID with at least five digits. | Implemented — one canonical helper governs the feeds, hosted tracking, form config, and Headless product responses |
| REQ-58 | Each product shall publish exactly one catalog-feed item; variants remain checkout choices addressed by their own `variant_id` and shall not create duplicate feed IDs. | Implemented — feeds use the first sellable variant for item pricing and omit `item_group_id` |

---

## 8. Administration

The primary users are store owners and the scoped `admin`, `advertiser`, and
`customer_service` operators defined in `src/lib/auth.ts`. The shared shell is
an operational workspace: it must help each role reach an allowed job, preserve
context across viewport sizes, and expose recoverable system state. This phase
does not change order, payment, shipping, or provider lifecycle rules; those
remain separate correctness work.

| ID | Requirement | Status |
| --- | --- | --- |
| REQ-60 | Admin access shall require a signed session validated against both KV and the credential record, with credential rotation invalidating existing sessions. | Implemented |
| REQ-61 | Admin routes shall be authorised per role, and unsafe admin API methods shall require same-origin. | Implemented |
| REQ-62 | The admin shall provide catalog CRUD, order management and detail, shipping operations, expedition configuration, payment and reconciliation views, ad configuration, store/warehouse/CRM settings, operator management, and developer API keys. | Implemented |
| REQ-63 | The content workbench shall support manual drafting and AI-assisted generation from live catalog facts, with publication always explicit. | Implemented |
| REQ-64 | Generated content shall never overwrite operational truth — price, stock, identifiers, activation, logistics, payment, credentials, or orders. | Implemented |
| REQ-65 | The admin shell shall be identical across installs; only merchant identity, data, and provider configuration vary. | Implemented |
| REQ-66 | The shared admin shell shall adapt without horizontal page overflow at 320 px, 390 px, tablet, and desktop widths: bottom navigation and sheets on phones, a compact collapsible rail on tablet, and the full sidebar on desktop, while preserving the current-location indicator and safe-area insets. | Implemented — A-89/A-92; browser overflow delta 0 px at 320/390/768/1280 |
| REQ-67 | For every authenticated role, the dashboard shall render and request only actions and operational panels that role is authorised to use; a legitimate role shall not receive a broken widget because its backing API is forbidden. Business KPIs shall precede secondary diagnostics, and every displayed metric shall describe the value actually calculated. | Implemented — A-90/A-94; analytics leads the overview, health and action surfaces derive from the deny-by-default route policy, and paid-order ratio is labelled as payment success rather than ad conversion |
| REQ-68 | Login, dashboard, search, navigation, and shared admin mutations shall expose explicit loading or pending, empty, recoverable error, permission, and success states without discarding usable content or form input. | Implemented for the shared login/dashboard shell — A-91; feature-specific mutation states remain owned by their feature requirements |
| REQ-69 | The admin shall remain keyboard-operable and readable under text zoom, with logical focus order, visible focus, labelled icon controls, 44 px touch targets, safe-area padding, and no clipped primary action at the supported phone, tablet, and desktop widths. | Implemented — A-92; real Chromium flow covered login, rotation, dashboard, search, mobile menu, and logout |

---

## 9. Headless integration

| ID | Requirement | Status |
| --- | --- | --- |
| REQ-70 | The system shall expose a versioned public API for storefront descriptor, product list and detail, district lookup, shipping rates, checkout, and tracking events. | Implemented |
| REQ-71 | Public API access shall require an issued API key validated against stored key hashes, plus an origin allowlist, with keys revocable from the admin. | Implemented |
| REQ-72 | An embedded checkout form shall be frameable only by origins the operator has allowed, failing closed on error. | Implemented |
| REQ-73 | Each Headless operation shall declare one minimum scope, and a key shall be rejected before route work when its stored scope does not cover that operation. | Implemented 2026-08-17 |
| REQ-74 | Headless API usage limits shall be stored per key and enforced atomically across isolates for minute and daily buckets; successful and rejected requests shall not rely on in-memory counters. | Implemented 2026-08-17 |
| REQ-75 | Headless write operations shall emit a D1 audit event containing key identity, operation, status code, and timestamp without storing request, order, customer, or payment payloads. | Implemented 2026-08-17 |
| REQ-76 | A Headless storefront shall be able to read public order status only with the order number plus its unguessable public status token, and the response shall expose no customer PII. | Implemented 2026-08-17 |

---

## 10. Operations

| ID | Requirement | Status |
| --- | --- | --- |
| REQ-80 | Merging to the release branch shall deploy production, and this shall be documented as the release action rather than contradicted. | Implemented **in an install repository**. Not true of this one: the product repository deploys nothing and holds no Cloudflare credentials (ADR-012, `RELEASE.md` §1) |
| REQ-81 | Schema upgrades shall be forward-only, validated against the bundled chain, and applied atomically by the Worker before database-backed requests; operators may run the same migrations explicitly as a pre-deploy check. | Implemented 2026-08-17 |
| REQ-82 | The system shall emit structured, labelled logs retained by Workers Logs, and shall send deduplicated firing and recovery notifications for actionable schema and CAPI outbox failures when an operator configures an HTTPS webhook. | Implemented 2026-08-17 |
| REQ-83 | An install shall report its version and applied schema version so an operator can determine what a given deployment is running. | Implemented — `src/pages/api/admin/health.ts`, role-gated, reporting version and applied schema version; surfaced on the dashboard |
| REQ-84 | Telemetry, if collected across installs, shall never include order, customer, or payment payloads. | Planned — no cross-install telemetry exists |
| REQ-85 | Operational alert state shall be persisted per install and notifications shall contain only signal identity, transition, timestamp, event id, and bounded reason. | Implemented 2026-08-17 |

---

## 11. Traceability

`TASKS.md` is the execution log. New tasks reference the requirement IDs in this document. Historical tasks reference the superseded scheme described in §0 and are not retro-fitted; their evidence lives in `BUILD-LOG.md`.
