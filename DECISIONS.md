# Architecture Decision Record — AdsBookCMS

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

**Date:** 2026-08-16 · **Status:** Proposed

**Context.** `tenantConfig` resolves from `import.meta.env`, which Astro freezes into the bundle at build time. Site name, URL, logo, tagline, theme colour, locale, and template therefore require a rebuild to change, and `stores.name` in D1 is a second, divergent value that does not affect storefront branding.

**Decision.** Identity becomes D1-owned. `tenantConfig` is replaced by a resolver that reads the `stores` row (cached in KV), falling back to environment values only during first boot, before the install wizard has run.

**Consequences.** Every current `tenantConfig` consumer (34 files, including all layouts and feeds) must accept an async or request-scoped config. This is the precondition for ADR-004 and cannot be deferred past it.

---

## ADR-004 — Installation is a first-run wizard, not a terminal procedure

**Date:** 2026-08-16 · **Status:** Proposed

**Context.** Onboarding currently requires an operator with Wrangler credentials, a `.env` file, and a manual seed. The product target is WordPress-like: point a domain at the Worker, open it, fill in a form.

**Decision.** A first-run `/install` route detects an uninitialised database, collects store identity, admin credentials, and locale/currency, writes them to D1, and marks the install complete. Once complete the route refuses to run again.

**Consequences.** Depends on ADR-003. Requires a neutral, deletable sample dataset (ADR-006) and a fail-closed empty state (ADR-007), because a fresh install has no content by definition.

---

## ADR-005 — Raw SQL is the data layer; Drizzle stays only as a migration DSL

**Date:** 2026-08-16 · **Status:** Accepted

**Context.** All 43 data-touching modules use `D1Database.prepare()`. `getDb()` has zero importers. The Drizzle journal has diverged from the migration directory, so `drizzle-kit generate` would emit a destructive diff.

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

**Date:** 2026-08-16 · **Status:** Proposed

**Context.** Product presentation already fails closed. Home content does not: with no published row, the bundle's `DEFAULT_HOME_CONTENT` is served, which is how another merchant's marketing copy reached a live storefront.

**Decision.** Missing published content renders an explicit setup state. Compiled copy is never a fallback for merchant-facing content.

---

## ADR-008 — `main` is the release branch and deploying is automatic

**Date:** 2026-08-16 · **Status:** Superseded by ADR-012 for this repository; still true inside an install repository

**Context.** *(Recorded before the split; see ADR-012.)* Four documents claimed that pushing to `main` does not deploy. At the time, `.github/workflows/deploy.yml` ran `npx wrangler deploy` on every push to `main`.

**Decision.** Keep the behaviour, document it honestly, and treat `main` as production. Feature work happens on branches; merging is the release action and requires the same approval as a deploy.

**Consequences.** No staging environment exists. Introducing one is a separate decision, not an assumed safety net.

---

## ADR-009 — npm is the package manager

**Date:** 2026-08-16 · **Status:** Accepted

**Decision.** `package-lock.json` + `npm ci` are authoritative, matching CI. This is a single-package repository. `pnpm-lock.yaml` and the `pnpm-workspace.yaml` stub are to be deleted.

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

**Note on history.** This repository carries the full 42-commit history from before the split, which includes former merchants' names and their deleted product photography in git objects. Acceptable while private; it needs a history rewrite before this repository is opened up or shared with collaborators.

---

## ADR-011 — "Permata Mall" is the bundled demo dataset, not a merchant

**Date:** 2026-08-16 · **Status:** Accepted

**Context.** The repository ships a complete storefront — 22 women's handbag products, 110 variants, product photography, and the `permatamall.shop` deployment. Earlier cleanup work treated this as live merchant data to be protected, which made every content decision unnecessarily cautious.

**Decision.** Permata Mall is the **demo dataset** that AdsBookCMS installs with. It exists so a fresh install has something real to look at, and it is replaced through the CMS when a merchant onboards. It is neither production data to be preserved at all costs nor foreign content to be purged.

**Consequences.**
- `scripts/seed-catalog.sql` and `public/images/products/` are product assets and stay.
- Breaking changes to this install — invalidating its sessions, rotating its cookie names, resetting its attribution — are acceptable when they improve the product.
- Content belonging to *other* merchants is still removed. The distinction is ours-versus-theirs, not demo-versus-real.
- Product identity in code defaults to AdsBookCMS, never to the demo store. An unconfigured install must describe itself, not inherit the bundle it was built from.

---

## ADR-010 — Documentation is verified against disk or it is deleted

**Date:** 2026-08-16 · **Status:** Accepted

**Context.** An audit found ~100 references to npm scripts that do not exist, four documents inverting the deploy contract, and one instructing agents to remove an HTTP header that a passing test asserts. The docs were inherited wholesale from the upstream engine and never reconciled.

**Decision.** Every document in this repository states only what can be verified against the current tree, and carries the date it was verified. A document describing another repository's machinery is deleted, not annotated. Aspirational work belongs in the gap register (`ARCHITECTURE.md` §10) or `UNIMPLEMENTED_SPECS.md`, never in the present tense.
