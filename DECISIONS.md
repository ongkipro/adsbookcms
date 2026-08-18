# Architecture Decision Record — AdsBookCMS

> Verified against disk: 2026-08-17 @ `5cb1d32` + current A10 working tree

Append-only. One decision per entry. A decision is recorded here only when it constrains future work; implementation detail belongs in `ARCHITECTURE.md`, remaining work in `UNIMPLEMENTED_SPECS.md`.

Status values: **Accepted** · **Superseded by ADR-nnn** · **Proposed** (decided in principle, not yet implemented).

---

## ADR-001 — One install per Worker

**Date:** 2026-08-16 · **Status:** Accepted

**Context.** The codebase was forked from a multi-tenant engine whose documentation described request-time tenant selection, a tenant registry, and a fleet deployment model. None of that machinery exists in this repository, and the data layer assumes a single logical merchant (`SELECT ... FROM stores ORDER BY id LIMIT 1`).

**Decision.** AdsBookCMS is a **single-install product**: one installer run produces one Worker, one D1, one KV namespace, one R2 bucket, one domain, one store. Isolation is a property of the deployment boundary.

**Consequences.** No `store_id` scoping work is required. Two stores mean two installs and two upgrade cycles. A fleet-management surface, if ever needed, is a separate product that drives installs from outside — not a mode inside this Worker.

**Rejected alternative.** Shared Worker with `Host`-based routing. Cloudflare does not permit selecting a D1 binding from request input, so this collapses into either one shared database (blast radius: every store) or Workers for Platforms (cost and operational weight far beyond the product).

---

## ADR-002 — The platform is the isolation boundary, so no tenant abstraction in code

**Date:** 2026-08-16 · **Status:** Accepted

**Decision.** Do not reintroduce tenant slugs, content packs, tenant registries, or per-tenant branches in application code. Inert remnants (`CONTENT_PACK_IDS`, `PUBLIC_TENANT_SLUG`, `CMSADS_TENANT_CONFIG`) are to be removed, not revived.

**Consequences.** Any behavioural difference between installs must be expressed as data in D1 or as configuration, never as a code branch keyed on identity.

---

## ADR-003 — Store identity must resolve at runtime, not at build time

**Date:** 2026-08-16 · **Status:** Accepted — implemented 2026-08-16 (migration `0036`, gap G1)

**Context.** Identity resolved from `import.meta.env`, which Astro freezes into the bundle at build time. Site name, URL, logo, tagline, theme colour, locale, and template therefore required a rebuild to change, and `stores.name` in D1 was a second, divergent value that did not affect storefront branding.

**Decision.** Identity is D1-owned. `readStoreIdentity` reads the `stores` row and `resolveTenantConfig` layers row → environment → product default; environment values now serve a store that has not set a field, which before the wizard runs is every field.

**Consequences.** Resolution happens once per request in `src/middleware.ts` and is handed to consumers as `Astro.locals.tenant`, so the 125 call sites stay synchronous — a per-consumer async read would have made every one of them an opportunity to forget an `await` for a value that cannot change mid-request. This was the precondition for ADR-004.

---

## ADR-004 — Installation is a first-run wizard, not a terminal procedure

**Date:** 2026-08-16 · **Status:** Accepted — implemented 2026-08-16 (`/install`, gap G2)

**Context.** Onboarding currently requires an operator with Wrangler credentials, a `.env` file, and a manual seed. The product target is WordPress-like: point a domain at the Worker, open it, fill in a form.

**Decision.** A first-run `/install` route detects an uninitialised database, collects store identity, admin credentials, and locale/currency, writes them to D1, and marks the install complete. Once complete the route refuses to run again.

**Consequences.** Depends on ADR-003. Requires a neutral, deletable sample dataset (ADR-006) and a fail-closed empty state (ADR-007), because a fresh install has no content by definition.

**Correction, 2026-08-17.** The implemented wizard collects store name, HTTPS site URL, optional tagline/support WhatsApp, admin username/password, and storefront template. It does not render locale or currency controls: locale currently enters the install plan as `id-ID`, while currency is not an installer field. The Decision sentence above records the original intent and must not be read as current UI evidence.

**Correction, 2026-08-17.** A new Worker no longer requires a terminal migration
step before the wizard. The first database-backed request applies the bundled
checked-in migration chain and then evaluates install state. Invalid, unknown, or
ahead migration history returns a labelled 503 rather than partially installing.

---

## ADR-005 — Raw SQL is the data layer; Drizzle is removed entirely

**Date:** 2026-08-16 · **Status:** Accepted

**Context.** All 45 data-touching modules use `D1Database.prepare()`. `getDb()` has zero importers. The Drizzle journal has diverged from the migration directory, so `drizzle-kit generate` would emit a destructive diff.

**Decision.** Raw prepared statements remain the data access pattern. `schema.ts` is not a source of truth; migrations are. New migrations are written by hand.

**Resolved 2026-08-16 — removed, not repaired.** `schema.ts`, `src/db/index.ts`, `drizzle.config.ts`, the whole `migrations/meta/` directory, both dependencies and the `db:generate` script are gone.

Repair was rejected on evidence. drizzle-kit's SQLite snapshots cannot represent the `product_variants_stock_nonnegative` trigger — the invariant `AGENTS.md` names as enforced by the database rather than the application — so the first generated migration that rebuilt that table would have silently dropped it. A repaired generator emitting correct-looking SQL that destroys a data-integrity guarantee is strictly worse than a broken one that fails loudly. The schema also holds a DESC-ordered index, a CHECK constraint, and five data migrations, none of which the generator can emit, so hand-authored SQL would have remained mandatory either way.

The audit that settled it also found the declared index layer was **fiction**: of 8 indexes in `schema.ts`, 6 existed in no migration at all — they lived only in a snapshot file — while 10 real indexes were undeclared. A reader would have assumed indexes that do not exist. That is the trap this decision removes.

---

## ADR-006 — Sample data must be neutral, ours, and deletable

**Date:** 2026-08-16 · **Status:** Accepted, implemented 2026-08-16 · **Amended by ADR-011**

**Context.** Migration `0017` seeds a product belonging to a previous merchant, and `product-mutation.ts` blocks deleting it through the admin API. Three sources disagree on what the "canonical sample" even is.

**Decision (as implemented).** The bundled demo catalog *is* the sample data (ADR-011) — it is ours, it is editable, and it is deletable. The separate "canonical immutable sample product" concept was therefore **removed**, not repointed: four sources disagreed on its identity, and an un-deletable row contradicts a CMS whose promise is that the merchant owns their catalog.

**Consequences.** Migration `0034` removes the foreign row from databases that already applied `0017`, guarded on identity (slug and title must still match what `0017` wrote, so an edited row survives) and on order references (nothing is removed while an `order_items` row points at one of its variants). Every statement is a guarded `DELETE`, so the migration is idempotent. `isCanonicalSampleProductId` and its five call sites are gone.

---

## ADR-007 — A fresh install fails closed, never inherits copy

**Date:** 2026-08-16 · **Status:** Accepted — implemented 2026-08-17 (G5)

**Context.** An active product without published presentation remains visible from its own catalog facts; that is the catalog contract, not a fallback. Home content is different: generated shell copy could make an unconfigured install look complete and previously allowed compiled merchant content to reach the wrong store.

**Decision.** Missing published home content renders an explicit setup state. Compiled or generated copy is never a fallback for merchant-facing home content. `getTenantHomeContent` returns `setup-required`, which both the built-in home and Headless storefront descriptor preserve.

---

## ADR-008 — `main` is the release branch and deploying is automatic

**Date:** 2026-08-16 · **Status:** Superseded by ADR-012 for this repository; still true inside an install repository

**Context.** *(Recorded before the split; see ADR-012.)* Four documents claimed that pushing to `main` does not deploy. At the time, `.github/workflows/deploy.yml` ran `npx wrangler deploy` on every push to `main`.

**Decision.** Keep the behaviour, document it honestly, and treat `main` as production. Feature work happens on branches; merging is the release action and requires the same approval as a deploy.

**Consequences.** No staging environment exists. Introducing one is a separate decision, not an assumed safety net.

---

## ADR-009 — npm is the package manager

**Date:** 2026-08-16 · **Status:** Accepted

**Decision.** `package-lock.json` + `npm ci` are authoritative, matching CI. This is a single-package repository. `pnpm-lock.yaml` and the `pnpm-workspace.yaml` stub were deleted on 2026-08-16; neither file exists.

---

## ADR-010 — Documentation is verified against disk or it is deleted

**Date:** 2026-08-16 · **Status:** Accepted

**Context.** An audit found ~100 references to npm scripts that do not exist, four documents inverting the deploy contract, and one instructing agents to remove an HTTP header that a passing test asserts. The docs were inherited wholesale from the upstream engine and never reconciled.

**Decision.** Every document in this repository states only what can be verified against the current tree, and carries the date it was verified. A document describing another repository's machinery is deleted, not annotated. Aspirational work belongs in the gap register (`ARCHITECTURE.md` §10) or `UNIMPLEMENTED_SPECS.md`, never in the present tense.

---

## ADR-011 — "Permata Mall" is the bundled demo dataset, not a merchant

**Date:** 2026-08-16 · **Status:** Superseded by ADR-016 on the bundling question; its ours-versus-theirs distinction still holds

**Context.** The repository ships a complete storefront — 22 women's handbag products, 110 variants, product photography, and the `permatamall.shop` deployment. Earlier cleanup work treated this as live merchant data to be protected, which made every content decision unnecessarily cautious.

**Decision.** Permata Mall is the **demo dataset** that AdsBookCMS installs with. It exists so a fresh install has something real to look at, and it is replaced through the CMS when a merchant onboards. It is neither production data to be preserved at all costs nor foreign content to be purged.

**Consequences.**
- ~~`scripts/seed-catalog.sql` and `public/images/products/` are product assets and stay.~~ Removed 2026-08-17; see ADR-016.
- Breaking changes to this install — invalidating its sessions, rotating its cookie names, resetting its attribution — are acceptable when they improve the product.
- Content belonging to *other* merchants is still removed. The distinction is ours-versus-theirs, not demo-versus-real.
- Product identity in code defaults to AdsBookCMS, never to the demo store. An unconfigured install must describe itself, not inherit the bundle it was built from.

---

---

## ADR-012 — Product and install live in separate repositories

**Date:** 2026-08-16 · **Status:** Accepted

**Context.** The CMS and its first store shared one repository. That is how the codebase reached the state this repository spent a day repairing: engine documentation describing another repository, three former merchants' content served from a live storefront, and an un-deletable sample product from a store nobody here operates. A fork per store cannot be kept in sync, so every fix has to be redone in every copy.

**Decision.** `ongkipro/adsbookcms` is the **product**. It deploys nothing, holds no Cloudflare credentials, and ships `wrangler.jsonc` as a template of placeholders. Each store is a separate repository with its own Worker, D1, KV, R2 and domain, and deploys from there.

**Consequences.**
- An install does **not** need a repository of its own. Cloudflare has no relationship to git, so the lightest install is a local clone of this repository pointed at the store's own resources, updated by `git pull`. A separate store repository is warranted only when the store needs its own history, CI, or collaborators. Both shapes are documented in `RELEASE.md` §7.
- The deploy workflow was removed from this repository and replaced with CI that runs check, test and build. Adding a deploy step or Cloudflare secrets here would let product work overwrite a live store — that is the specific hazard this decision exists to prevent.
- Per-store differences are configuration and data, never code. A store that needs a code change needs it in the product.
- Carrying a fix into a store is a deliberate act by that store, gated by its own approval and deploy.
- This is a fork model, and its known cost is drift between product and installs. It was chosen over one shared repository so the product can be developed freely without every change touching live traffic. Keeping installs current is therefore an explicit, recurring task, not something the structure does for you.

**Note on history.** The repository was split carrying the full history from
before it, which included former merchants' names and their deleted product
photography in git objects — 64 such blobs. `main` was re-founded on an orphan
root on 2026-08-16: 3 commits, no foreign blobs, `.git` from 133MB to 26MB. The
previous 61 commits are preserved locally on `backup/pre-history-rewrite` and are
not published. Anything citing a commit older than the new root refers to that
branch, not to `main`.

---

---

## ADR-013 — Path decisions come from the URL the framework routed on

**Date:** 2026-08-17 · **Status:** Accepted

**Context.** `src/middleware.ts` classified every request — private or public,
admin or storefront, installer or not — from `new URL(context.request.url)`.
Astro routes on a normalized pathname instead: it percent-decodes in a loop and
collapses duplicate slashes, exposing the result as `context.url` while leaving
`context.request` at the raw bytes the client sent.

The two strings differ for any request an attacker chooses to make them differ
for. Measured on the built Worker under `wrangler dev`, with no cookie:
`/api/admin/settings` returned 401 while `//api/admin/settings` returned 200 with
the store's provider settings, and `PUT //api/admin/settings` from a foreign
origin returned 200 and rewrote the courier API key. The session check, the role
check, the CSRF origin check and the password-rotation gate were all inside the
block that was skipped.

**Decision.** Every path decision in middleware reads `context.url`. Nothing
derives a pathname from `context.request`. `src/lib/middleware-path-source.test.ts`
fails if that changes, and `auth.test.ts` drives the real handler with the shapes
that got through.

**Consequences.** A test harness that constructs a context must supply `url`
itself; supplying only `request` is what let this pass CI. The harness now
reproduces Astro's normalization rather than skipping it.

---

## ADR-014 — A rate-limit ceiling may not be reachable by someone who only knows a username

**Date:** 2026-08-17 · **Status:** Accepted

**Context.** Admin login counted failures in three buckets: the pair
`username|ip` at 5, the address at 20, and the identifier at 50. The identifier
bucket was documented as a backstop against a distributed attempt, with the
lockout it implies accepted as "a wait of at most one window".

That accounting was right and the conclusion was wrong. Ten addresses spending
their pair allowance is exactly 50, so sixty requests — knowing only the
username, guessing no passwords — denied the real operator, with the correct
password, from an address that had never failed. Repeatable at four requests a
minute, indefinitely. A single host with an IPv6 /64 has 2⁶⁴ addresses.

**Decision.** The identifier bucket still counts everywhere but denies only an
address that has itself failed for that account inside the window. An attacker
cannot place a failure on an address they do not control, so the operator keeps a
way in; a distributed attempt still hits its ceiling on every address it uses.

**Consequences.** A distributed attacker with unlimited fresh addresses is
bounded by the pair bucket alone, at 5 per address per window against 100k-round
PBKDF2. That is the accepted trade, and it is the right way round: availability
of the merchant's own admin over a marginal gain against an attacker who already
has to bring new infrastructure per attempt.

Separately and still open: `checkRateLimit` is a non-atomic KV get-then-put, so N
simultaneous guesses read the same count and spend one slot between them. It
damps sequential guessing, not parallel. Making it exact needs a Durable Object —
task **A-71**.

---

## ADR-015 — Catalog identity is `p{product}-v{variant}`, derived from keys that never change

**Date:** 2026-08-17 · **Status:** Superseded by ADR-017

**Context.** One rule governs catalog advertising: the `id` a feed publishes must
be exactly the string the Pixel and CAPI send as `content_ids`. Meta states it
directly — "for dynamic ads, this ID must exactly match the content ID for the
same item in your Meta Pixel."

It did not match. The feed published `10001` (row id plus 10000), the admin
screen showed the operator that same `10001`, and the Pixel sent the raw row id,
`1`. Three values for one product, and nothing anywhere reported a problem:
Advantage+ and Dynamic Product Ads simply retargeted nobody while the merchant
paid for the traffic. Two further defects rode along — the first variant of a
multi-variant product was published without its `item_group_id`, so the group had
one member and the orphan's id collided with the group id; and the group was
submitted with no variant attribute at all, which Google requires and which is a
common reason for outright feed disapproval.

**Decision.** The catalog is variant-level. The item id is
`p{product_id}-v{variant_id}`; the group every variant shares is
`p{product_id}`; the group is never published as an item.

Both derive from the D1 AUTOINCREMENT keys, **not** from SKU — despite both
platforms recommending SKU. Google's rule is that an id, once assigned, is never
changed and never reused, and `product_variants.sku` here is nullable and
merchant-editable, so it is precisely the value that moves. The primary keys
never change and are never handed out twice.

The prefix is not decoration. Neither specification imposes a minimum length or
digits-only — Google allows 1–50 characters of alphanumerics, dashes and
underscores, Meta allows 100 — but a bare `1` is fragile exactly where feeds
travel: spreadsheet and CSV coercion, leading zeros dropped, collisions when two
sources merge. Three characters remove all of that and make the id self-
describing, so `p1-v12` says what it is where `12` does not. Padding to a fixed
width, which is what the previous scheme attempted, buys none of it.

**Consequences.** `content_id` in `/api/v1/products*` and `/api/form-config`
changes value — the field names are unchanged, so this is a value break rather
than a shape break, and it is documented in `STOREFRONT_INTEGRATION.md`. A client
following the old contract was already failing to match the catalog.

Ids must never change again. Any install that has already submitted a feed would
need its catalog re-created, which is why this landed before the product had live
installs and must not be revisited casually.

`src/lib/catalog-identity.test.ts` checks the two halves against each other —
what the feed publishes against what each surface sends — rather than each
against a fixture, because a fixture is how three different values passed CI.

Deferred: `product_variants` records one free-text label and nothing that says
which axis it varies, so every label ships as `g:size` whether it is a size, a
colour or a pack count. Google treats size as free text, so this is imprecise
rather than invalid. A `variant_axis` column is the upgrade.

---

## ADR-016 — A fresh install ships empty

**Date:** 2026-08-17 · **Status:** Accepted

**Context.** ADR-011 kept a bundled demo catalogue — 22 products, 110 variants
and 8.9MB of photography — so a fresh install had "something real to look at".
That was a reasonable answer while this repository was still one store becoming a
product. It reads differently now that an install is a wizard away: the first
thing an operator meets is somebody else's inventory, in a category they may not
sell, which they must find and delete before their own catalogue makes sense.

The empty states turned out to be already built and already honest. Measured on a
migrated, installed, product-free database: `/produk` renders "Katalog sedang
disiapkan — produk akan muncul setelah konten dan varian diterbitkan",
`/kontak` renders "Kontak Belum Tersedia", the catalog feeds emit valid empty
XML, the sitemap resolves, and every route returns 200. Nothing was broken by
having nothing.

**Decision.** No dataset ships. `scripts/seed-catalog.sql`,
`public/images/products/` and the `db:reset:demo:local` script are removed. An
install starts genuinely empty, and the storefront says so.

Whether to reintroduce sample data — and if so, whether as a seed, an optional
one-click demo from the admin, or a downloadable pack — is **deferred**, not
decided against. This ADR records that the bundled-by-default answer was wrong,
not that the question is closed.

**Consequences.**
- `public/images` went from 21MB to 232KB across this and the orphan-asset
  cleanup. What remains is the product's own mark, the favicon, and the payment
  method logos.
- The home page gained the empty state its siblings already had. The product
  grid, the search box and the "0 of 0" counter are hidden when there is nothing
  to count, so a visitor sees an explanation rather than a broken-looking page.
- **The ad taxonomy lost its justification and had to change.** Its default was
  Google category `6551`, Handbags, reasoned in the code as "at least a category
  this catalog sells". With no catalogue that premise is false, and keeping the
  default would have submitted every unclassified product in every store to
  Merchant Center as a handbag — the exact misrepresentation the same comment
  warns about. `getAdTaxonomy` now returns no category when no rule is
  confident, and the feeds omit `google_product_category` and
  `fb_product_category` rather than assert one. Both fields are optional and
  Google auto-classifies what is missing.
- Gap **G5** narrows to the home *shell*: `buildDefaultHomeContent` still
  composes headings from the store's identity rather than rendering an operator
  setup state. That is A-12b and stays open. The harm G5 originally described —
  a fresh install inheriting another merchant's marketing copy — is gone.
- Anything relying on the demo catalogue for grounding is now unfounded, and
  `docs/GOOGLE_ADS_SETUP.md`'s taxonomy reasoning was rewritten accordingly.

---

## ADR-017 — Product ID is the single advertising catalog identity

**Date:** 2026-08-18 · **Status:** Accepted

**Context.** ADR-015 made feeds variant-grained, but the rest of the funnel did
not consistently carry that identity. Hosted forms and confirmation could send
the bare product row while browser ViewContent sent `p{product}-v{variant}`.
This made otherwise valid Meta and Google events impossible to match reliably.
The operator also needs the ID shown in Admin, the public API `content_id`, and
the XML feed `<g:id>` to describe the same business object without translation.

**Decision.** The immutable numeric Product ID is the one catalog identity.
New products are allocated a decimal ID from 10000 through 99999. A canonical
ID must contain at least five digits, have no leading zero, and fit within a
JavaScript safe integer. Product ID, API `content_id`, Meta `content_ids`, Google
ecommerce `item_id`, and both feeds' `<g:id>` are byte-identical.

Each active product produces exactly one feed item. The first sellable variant
supplies its price and optional SKU to that item. Other variants remain checkout
choices addressed by their raw `variant_id` and may be reported separately as
`item_variant`; they do not create another advertising identity. Feeds omit
`item_group_id` because they no longer publish variant-grained items.

**Consequences.** Existing external catalogs created from ADR-015 identifiers
must be refreshed or recreated when this change is deployed; queued historical
events are not rewritten. Legacy database rows with Product IDs below 10000
fail closed and require an explicit catalog remap rather than silent padding,
because padding would break the promise that external identity equals Product
ID. Variant selectors and embed URLs must always use `variant.id`, never the
shared `content_id`.
