# Installing AdsBookCMS

> Verified against disk: 2026-08-16 @ `0a145c5`

This document describes how an install is actually stood up today, and where that process is still rougher than the product intends to be. It contains no commands that do not exist. Where a step is manual because the tooling has not been built yet, it says so and points at the gap.

**An install is one Worker, one store.** Two stores mean running this procedure twice against two separate sets of Cloudflare resources.

---

## 1. What an install consists of

| Component | Created by | Notes |
| --- | --- | --- |
| Worker | `wrangler deploy` | name must be globally unique in the account |
| D1 database | `wrangler d1 create` | binding `OMS_DB` |
| KV namespace | `wrangler kv namespace create` | binding `SESSION` |
| R2 bucket | `wrangler r2 bucket create` | binding `ASSET_BUCKET` |
| Workers AI | binding only | no resource to create |
| Custom domain | Cloudflare dashboard or `routes` in `wrangler.jsonc` | apex and `www` |

Binding **names** are fixed across every install — `OMS_DB`, `SESSION`, `ASSET_BUCKET`, `AI`, `ASSETS`. Only the underlying resource names and ids differ. Do not rename bindings per install; the application resolves them by name.

---

## 2. Prerequisites

- Node 22+ and npm 10+
- A Cloudflare account with Workers, D1, R2, and Workers AI available
- Wrangler authenticated to **that** account — confirm with `npx wrangler whoami` before creating anything
- A domain on that Cloudflare account

A repository copy grants no access to another account's resources. The ids committed in `wrangler.jsonc` belong to the reference install and must be replaced, not reused.

---

## 3. Local bootstrap

```bash
npm ci
npm run check
npm test
```

If these do not pass on a clean checkout, stop — the problem is the checkout, not the install.

---

## 4. Create Cloudflare resources

```bash
npx wrangler d1 create <store>-d1
npx wrangler kv namespace create SESSION
npx wrangler r2 bucket create <store>-assets
```

Each command prints an id. Put them into `wrangler.jsonc`, replacing the reference values:

```jsonc
{
  "name": "<worker-name>",
  "d1_databases":  [{ "binding": "OMS_DB",       "database_name": "<store>-d1", "database_id": "…", "migrations_dir": "src/db/migrations" }],
  "kv_namespaces": [{ "binding": "SESSION",      "id": "…" }],
  "r2_buckets":    [{ "binding": "ASSET_BUCKET", "bucket_name": "<store>-assets" }],
  "ai":            { "binding": "AI" },
  "routes": [
    { "pattern": "<domain>",     "custom_domain": true },
    { "pattern": "www.<domain>", "custom_domain": true }
  ]
}
```

Keep `"workers_dev": false` so the install never gets an unreviewed `*.workers.dev` endpoint.

---

## 5. Set store identity — read this before building

Store identity is **compiled into the bundle at build time**, not read at runtime. Both `wrangler.jsonc` `vars` and the local `.env` feed it, so setting either works — but only if you **rebuild afterwards**. Deploying an already-built bundle with new vars changes nothing on the storefront.

Set these in `wrangler.jsonc` `vars` (and mirror them in `.env` for local development) before running `npm run build`:

| Variable | Effect |
| --- | --- |
| `PUBLIC_SITE_NAME` | every `<title>`, header, footer, JSON-LD publisher, OG site name |
| `PUBLIC_SITE_URL` | canonical origin — must be `https:`, no path, no query, or it silently falls back |
| `PUBLIC_SITE_DESCRIPTION` | default meta description |
| `PUBLIC_SITE_LOGO` | storefront and admin logo path |
| `PUBLIC_SITE_TAGLINE` | brand line, also used to compose the default title |
| `PUBLIC_SITE_THEME_COLOR` | must match `#rrggbb` or it falls back |
| `PUBLIC_SITE_LOCALE` | `id-ID` style; drives `lang` and OG locale |
| `PUBLIC_STOREFRONT_TEMPLATE` | `compact-market` or `wide-catalog` — **an unknown value makes every route return 500** |
| `PUBLIC_ADMIN_NAME` | admin shell display name |
| `PUBLIC_COD_DISABLED_PROVINCES` | comma-separated province names excluded from COD |
| `PUBLIC_EMBED_ALLOWED_ORIGINS` | fallback embed allowlist until one is saved in the database |
| `PUBLIC_HEADLESS_ALLOWED_ORIGINS` | optional Headless API fallback until its separate allowlist is saved in the database |

Keep `wrangler.jsonc` `vars` and `.env` in agreement. Both feed the build, precedence between them is undetermined, and a few keys (`PUBLIC_COD_DISABLED_PROVINCES`, `PUBLIC_EMBED_ALLOWED_ORIGINS`, `PUBLIC_HEADLESS_ALLOWED_ORIGINS`) are additionally read at runtime through `getRuntimeEnv()`, where only the Worker's own vars apply.

One identity field cannot be configured at all: `slug` is hardcoded to `"adsbook"` in `src/lib/tenant.ts`. It is used only for diagnostics, but it is the same on every install. This is gap **G1** — see `DECISIONS.md` ADR-003.

---

## 6. Secrets

Set as Worker secrets, never in `wrangler.jsonc`:

```bash
npx wrangler secret put AUTH_SECRET
npx wrangler secret put BOOTSTRAP_ADMIN_PASSWORD
```

Provider credentials — `MENGANTAR_API_KEY`, `AUTOLARIS_API_KEY`, `META_CAPI_ACCESS_TOKEN`, and their base URLs — can be set either as secrets or, preferably, saved later from `/admin/profile` and `/admin/ads`. The database value wins over the deployed secret, and `/admin` reports which source is active.

For local development the same keys go in `.dev.vars`, which is never committed.

---

## 7. Apply the schema

```bash
npm run db:migrate:local     # verify locally first
npm run db:migrate:remote    # then the real database
```

Migration `0007` seeds a bootstrap `admin` credential with `must_change_password = 1`. The hash is identical in every copy of this repository, so **rotating it at first login is mandatory, not advisory** — until it is rotated, anyone with the source can attempt the default.

Migration `0034` removes the foreign sample row introduced by `0017` when it is still untouched and unreferenced. A fresh schema therefore contains no merchant product data. The optional `npm run db:reset:demo:local` path loads a neutral, fully editable demo catalog instead.

---

## 8. Deploy

```bash
npm run build
npm run deploy
```

Then attach the custom domain and confirm:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/produk
```

Note that if the repository is connected to CI, pushing to `main` will also deploy. See `RELEASE.md`.

---

## 9. First login and store configuration

1. Open `/hello` — the login route is deliberately not `/admin/login`, and `robots.txt` disallows it.
2. Sign in with **`admin` / `admin`**. That is the documented first-run credential and needs no configuration; if you set `BOOTSTRAP_ADMIN_PASSWORD` (16 characters or more) it replaces the default entirely.
3. **Rotate it immediately.** Until you do, that session can reach nothing but the password screen — no orders, no customers, no provider keys — so the install is contained but also unusable until rotated.
3. Configure, in order:
   - `/admin/settings/store` — store name and support WhatsApp (the support number feeds the public `/kontak` page)
   - `/admin/settings/warehouse` — pickup origin and Mengantar origin ids; shipping quotes fail without this
   - `/admin/profile` — provider API keys and base URLs
   - `/admin/expeditions` — which couriers and which COD services are offered
   - `/admin/ads/meta` and `/admin/ads/google` — pixel, CAPI token, GTM, conversion ids
   - `/admin/settings/crm` — WhatsApp follow-up templates
   - `/admin/products` — the real catalog
   - `/admin/content` — publish home content

**Publish home content before announcing the store.** Until a home row exists, the storefront falls back to copy compiled into the bundle rather than showing a setup state. That is gap **G5** and it is how another merchant's marketing copy once reached a live storefront.

---

## 10. Running more than one install

A Cloudflare Worker has **no relationship to git**. `wrangler deploy` uploads a built bundle from whatever directory you run it in; Cloudflare never sees a repository. A repo buys you history and CI, nothing else. You can deploy an install from a laptop with no remote at all.

So one repository *can* target many Workers. Verified against the installed wrangler (4.120.0):

| Mechanism | Command | What it changes |
| --- | --- | --- |
| Separate config file | `wrangler deploy --config installs/toko-a.jsonc` | everything: name, bindings, routes, vars |
| Named environment | `wrangler deploy --env toko-a` | the `env.toko-a` block in one config |
| Name override | `wrangler deploy --name toko-a` | the Worker name only — **not** its bindings, so it would point at another install's database. Never use this alone to separate stores |

The `env.*` mechanism is real (`RawEnvironment` in the wrangler config schema) and is what the upstream engine used.

### The constraint that decides this today

Store identity is **baked into the bundle at build time** (§5, and gap **G1**). One build therefore serves exactly one store. "Many installs from one repository" currently means *many builds*, each with its own variables, then a deploy per build — not one build fanned out.

Once identity resolves at runtime from D1 (**A-10**, ADR-003), that changes: the bundle stops carrying a store's name, and the only per-install difference left in the repository is bindings and routes. A single build could then serve every install, and one repository holding N small config files becomes genuinely cheap.

### Why installs are separate repositories today

ADR-012 puts each install in its own repository. That is a deliberate trade: maximum isolation between a live store and product development, paid for with drift — every install must be brought forward by hand.

Revisit it after A-10, not before. Mixing store configuration back into the product repository is what produced the state this codebase spent a day repairing: another merchant's content on a live storefront, and a deploy workflow that pointed at somebody else's Worker.

---

## 10. What is still manual

This procedure is a developer runbook, not a product install. The intended experience — point a domain at the Worker, open it, fill in a form — needs:

| Gap | Blocking what |
| --- | --- |
| **G1** identity is build-time | the wizard cannot set a store name without a rebuild |
| **G2** no `/install` route | every install needs a terminal and Cloudflare credentials |
| **G3** no schema auto-upgrade | upgrading an install is a manual migration run |
| **G5** home content does not fail closed | a fresh install shows inherited copy |
| **G7** no observability | a broken customer install cannot be diagnosed remotely |

Tracked in `ARCHITECTURE.md` §10. The decisions behind the target design are ADR-003 and ADR-004 in `DECISIONS.md`.
