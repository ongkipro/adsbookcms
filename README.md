# AdsBookCMS

> Verified against disk: 2026-08-18 @ `0af225b` on `feat/admin-access-dashboard`

A self-contained direct-response commerce CMS that installs onto Cloudflare Workers. One install runs one store: storefront, landing-page builder, checkout with COD and online payment, order management, courier dispatch, ad-signal tracking, and an admin dashboard — in a single Worker with its own database.

**Install model: 1 installer = 1 Worker = 1 store.** Isolation comes from the deployment boundary, not from tenant routing inside the application (`DECISIONS.md` ADR-001).

**This repository is the product. It deploys nothing.** An install lives in its own repository, with its own Worker, D1, KV, R2 and domain, and deploys from there. `wrangler.jsonc` here is a template of placeholders, and there are no Cloudflare credentials in this repository by design (ADR-012).

The first install built on this code is `permatamall.shop`, in the separate `ongkipro/permatamall` repository. Its Cloudflare resources still carry `cmsads-*` names inherited from the upstream engine; those are legacy and deliberately not renamed, because renaming a Worker creates a new one and drops its custom domain, and D1 and R2 names cannot be changed in place.

---

## What an install looks like

Point a Worker with an empty, migrated D1 at a domain and open it. Every route redirects to `/install`, which asks once for the store name, address, optional tagline and support number, the admin username and password **you choose**, and a storefront template. Submitting writes the store row and your credential in a single transaction, then the wizard refuses to run again.

Two things that will otherwise cost an afternoon:

- **Set `AUTH_SECRET` (32+ characters) before installing.** The installer checks it and refuses before writing anything, because the login route needs it to sign a session — without it the install completes and then locks you out.
- **Apply the migrations first.** An unmigrated database also routes to `/install`, and the installer will tell you so rather than half-writing a store.

`admin` / `admin` remains a fallback only for an install whose credential was never claimed by a wizard, and a session on it can reach nothing but its own password change (`PRD-ADMIN-LOGIN.md`).

Full procedure, including creating the Cloudflare resources: `INSTALLATION.md`.

---

## Quick start (local)

```bash
npm ci
npm run db:migrate:local      # 44 migrations, applied to a local D1
npm run cf:dev                # wrangler dev --local, closest to production
```

`npm run dev` is faster for pure UI work but runs without the Worker bindings, so anything touching D1, KV or R2 needs `cf:dev`.

**No dataset ships.** An install starts genuinely empty and says so: the storefront renders "Katalog sedang disiapkan", `/kontak` reports that no support number is configured, and the catalog feeds emit valid empty XML. Add products from `/admin` and they appear. Whether to offer optional sample data later is deferred (ADR-016).

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Astro 7, full SSR (`output: 'server'`) |
| Islands | React 19 |
| Runtime | Cloudflare Workers (`nodejs_compat`) |
| Database | Cloudflare D1, accessed with raw prepared statements |
| Sessions / counters | Cloudflare KV |
| Media | Cloudflare R2 |
| AI | Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) for admin content drafting |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Package manager | npm (`package-lock.json` is authoritative) |

Requires Node 22+ and npm 10+.

---

## Commands

Every command below exists in `package.json`.

```bash
npm run dev            # astro dev on :4321 — no Worker bindings
npm run cf:dev         # wrangler dev --local

npm test               # node --test over src/lib/*.test.ts  (354 tests)
npm run check          # astro check && tsc --noEmit
npm run build          # astro build

npm run db:migrate:local     # optional local preflight; runtime also upgrades

# The two below act on live infrastructure and belong to an install, not to this
# repository. Run from an install's checkout, against its own wrangler.jsonc.
npm run db:migrate:remote    # optional explicit preflight — approval required
npm run deploy               # wrangler deploy — deploys that install
```

There is no migration generator. Drizzle was removed entirely (ADR-005) — `db:generate` is not a script and drizzle-kit is not a dependency. Write migrations by hand, forward only; never edit one that has been applied.

A green build is not proof the storefront works. For any browser-visible change, open the page — an unterminated `.astro` frontmatter block once returned 404 on a live route while every static check stayed green.

---

## Deploying

**Pushing to `main` here deploys nothing.** `.github/workflows/ci.yml` runs check → test → build only.

Deploying is an install's job. On its first database-backed request, the new Worker validates and atomically applies the bundled missing migration suffix before serving traffic. An operator may still apply migrations explicitly before deploy as a separately approved preflight. Full detail: `RELEASE.md`.

---

## Repository layout

```
src/
  pages/           storefront, admin, /api/*, /api/v1/*, feeds, media
  components/      admin/ forms/ home/ seo/ shared/ storefront/ tracking/ ui/
  lib/             business logic and colocated tests
  db/              42 hand-authored migrations — the only schema description
  layouts/         BaseLayout, AdminLayout, EmbedLayout
  styles/           global.css (Tailwind v4 entry), form-hybrid.css (checkout)
  data/             reference data (Indonesian districts) + legal page templates
  middleware.ts     identity resolution, install gate, session, role policy, embed CSP
scripts/            maintenance scripts
public/             static assets served by the Cloudflare adapter
```

---

## Configuration

Identity resolves **row first, environment second, product default last**, on every request:

- **D1 `stores` row** — store name, canonical URL, description, tagline, logo, theme colour, locale, storefront template, and the provider half: API keys, tracking IDs, fee policy, payment toggles, CRM templates, support contact. Edited from `/admin`, effective on the next request with no rebuild.
- **Worker runtime env** — secrets and a few public vars, read through `getRuntimeEnv()`. A deploy, no rebuild.
- **Build-time bundle** — the `PUBLIC_SITE_*` vars reach `import.meta.env` from `wrangler.jsonc` `vars` and `.env`, frozen by `astro build`. They are the fallback for a store that has not set a field, which before the wizard runs is every field, so keep them accurate — but they are no longer where a running store's identity lives.

Provider credentials follow a **D1-first, env-fallback** rule, and `provider-config.ts` reports which source won.

---

## Integrating

- **Headless API** — `/api/v1/*`, key-authenticated, documented in `STOREFRONT_INTEGRATION.md`.
- **Embeddable checkout** — `/embed/form`, origin-restricted through a stored allowlist.
- **Ad signals** — Meta Pixel + CAPI with `event_id` deduplication, Google Ads with Enhanced Conversions and Consent Mode v2. `TRACKING_SPECS.md` is the contract.
- **Catalog feeds** — `/feed/google-catalog.xml` and `/feed/meta-catalog.xml`. Each product publishes one item. Its numeric Product ID is also the API `content_id`, Meta `content_ids`, Google ecommerce `item_id`, and feed `<g:id>`, byte for byte (ADR-017).

---

## Documentation

`AGENTS.md` §2 owns the ownership table — which document is authoritative for which subject. It is not repeated here; when both files carried a copy, they drifted.

Every document carries the date and commit it was verified against (ADR-010). **If a document and the code disagree, the code is right and the document is the bug.**

---

## Status

All ten structural gaps in `ARCHITECTURE.md` §10 are closed. Remaining audited defects and blocked provider work live in `UNIMPLEMENTED_SPECS.md`; current executable state is in `STATUS.md`.

Current state is `STATUS.md`; the active backlog is Phase A in `TASKS.md`; history is `BUILD-LOG.md`.
