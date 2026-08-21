# Installing AdsBookCMS

> Verified against disk: 2026-08-19 @ `3666a1d` + the working tree on `feat/admin-access-dashboard`

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

A repository copy grants no access to another account's resources. The ids committed in `wrangler.jsonc` are all-zero placeholders and must be replaced with resources owned by the target install.

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

## 5. Store identity — set by the installer, not by the build

**You do not configure identity here.** A migrated database with no `stores` row
redirects every route to `/install`, and the wizard writes the store name,
address, tagline, support number, template and the operator's own credential in
one transaction (§9). Identity is read from that row per request, so renaming the
store in `/admin` takes effect on the next request with no rebuild.

> This section used to be the configuration procedure, and it said identity was
> compiled into the bundle. That was true before migration `0036`; following it
> now means rebuilding to change a value the admin screen already edits — and it
> never mentioned `/install` at all, which is the screen a fresh install actually
> opens on.

The `PUBLIC_SITE_*` vars remain as the **fallback** for a store that has not set
a field — which, before the wizard runs, is every field. They still reach the
bundle through `import.meta.env` at build time, so a change to them needs a
rebuild. Keep them accurate, because they are what an uninstalled Worker shows:

| Variable | Effect |
| --- | --- |
| `PUBLIC_SITE_NAME` | every `<title>`, header, footer, JSON-LD publisher, OG site name |
| `PUBLIC_SITE_URL` | canonical origin — must be `https:`, no path, no query, or it silently falls back |
| `PUBLIC_SITE_DESCRIPTION` | default meta description |
| `PUBLIC_SITE_LOGO` | storefront and admin logo path |
| `PUBLIC_SITE_TAGLINE` | brand line, also used to compose the default title |
| `PUBLIC_SITE_THEME_COLOR` | must match `#rrggbb` or it falls back |
| `PUBLIC_SITE_LOCALE` | `id-ID` style; drives `lang` and OG locale |
| `PUBLIC_STOREFRONT_TEMPLATE` | `compact-market` or `wide-catalog` — an unknown value logs `tenant-unknown-storefront-template` and falls back to `compact-market` |
| `PUBLIC_ADMIN_NAME` | admin shell display name |
| `PUBLIC_COD_DISABLED_PROVINCES` | comma-separated province names excluded from COD |
| `PUBLIC_EMBED_ALLOWED_ORIGINS` | fallback embed allowlist until one is saved in the database |
| `PUBLIC_HEADLESS_ALLOWED_ORIGINS` | optional Headless API fallback until its separate allowlist is saved in the database |

Keep `wrangler.jsonc` `vars` and `.env` in agreement. Both feed the build, precedence between them is undetermined, and a few keys (`PUBLIC_COD_DISABLED_PROVINCES`, `PUBLIC_EMBED_ALLOWED_ORIGINS`, `PUBLIC_HEADLESS_ALLOWED_ORIGINS`) are additionally read at runtime through `getRuntimeEnv()`, where only the Worker's own vars apply.

`slug` is derived from the store name by the installer and stored on the row;
`PUBLIC_TENANT_SLUG` overrides it and `"adsbook"` is the last resort. It is used
only for diagnostics.

---

## 6. Secrets

Set as Worker secrets, never in `wrangler.jsonc`:

```bash
npx wrangler secret put AUTH_SECRET
npx wrangler secret put INSTALL_TOKEN
npx wrangler secret put BOOTSTRAP_ADMIN_PASSWORD
```

Provider credentials — `MENGANTAR_API_KEY`, `AUTOLARIS_API_KEY`, `META_CAPI_ACCESS_TOKEN`, and their base URLs — can be set either as secrets or, preferably, saved later from `/admin/profile` and `/admin/ads`. The database value wins over the deployed secret, and `/admin` reports which source is active.

`INSTALL_TOKEN` is the one-time capability requested by the fresh-install wizard;
use a unique random value of at least 16 characters. It is never stored in D1.

For local development the same keys go in `.dev.vars`, which is never committed.

---

## 7. Verify the schema path

The Worker bundles all 44 checked-in migrations (`0000`–`0043`) and applies a valid missing suffix
automatically before serving a database-backed request. No terminal migration step
is required for first run. Invalid, unknown, or ahead migration history returns a
labelled 503 instead of running the application against an indeterminate schema.

An operator may still preflight the same chain explicitly:

```bash
npm run db:migrate:local
npm run db:migrate:remote    # live D1; separate approval required
```

Migration `0007` contains a legacy bootstrap credential for databases provisioned
outside the wizard. The first-run installer replaces it atomically with the
operator's chosen credential. Migration `0034` removes the inherited foreign
sample row when safe; no catalog dataset ships.

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

Pushing to `main` in **this** repository deploys nothing — CI runs check, test and build, and there are no Cloudflare credentials here (ADR-012). Deployment belongs to an install repository. See `RELEASE.md` §1.

---

## 9. First run

1. Open the domain. The first database-backed request applies the bundled
   migration chain. With no store row, every normal route redirects to **`/install`**.
2. Fill the form once: store name, address (`https:`), optional tagline and
   support WhatsApp, the admin username and password **you choose**, and the
   storefront template. Submitting writes the store and your credential in a
   single transaction, and the wizard refuses to run again.
   - The installer refuses before writing anything if `AUTH_SECRET` is unset or
     shorter than 32 characters — otherwise the install would complete and then
     lock you out, because the login route needs it to sign a session.
3. You land on `/hello`. Sign in with the credential you just chose; nothing is
   left to rotate.
   - `admin` / `admin` remains the fallback only for an install whose credential
     was never claimed by a wizard. A session on it reaches nothing but its own
     password change. `BOOTSTRAP_ADMIN_PASSWORD` (16 characters or more)
     replaces it entirely.
4. Configure, in order:
   - `/admin/settings/store` — store name and support WhatsApp (the support number feeds the public `/kontak` page)
   - `/admin/settings/warehouse` — pickup origin and Mengantar origin ids; shipping quotes fail without this
   - `/admin/profile` — provider API keys and base URLs
   - `/admin/expeditions` — which couriers and which COD services are offered; a fresh install starts with the neutral ten-courier catalogue, and the operator may narrow it here
   - `/admin/ads/meta` and `/admin/ads/google` — pixel, CAPI token, GTM, conversion ids
   - `/admin/settings/crm` — WhatsApp follow-up templates
   - `/admin/products` — the real catalog

The storefront does not wait for home content. With no published home row it
renders a neutral automatic catalogue of the store's own active products, so an
install is usable the moment products exist. The JSON/AI content workbench is
off the main navigation (ADR-018), but `/admin/content` itself stays reachable
and unchanged; the bounded banner, slider, and supporting-copy editor that
replaces it is **A-134** in `TASKS.md`.

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

Identity now resolves at runtime from D1 (**A-10**, ADR-003, gap G1 closed), so
the bundle no longer carries a store's name. The only per-install difference left
in the repository is bindings and routes — one build can serve every install, and
a repository holding N small config files is genuinely cheap. This is the
condition the section below was waiting on; the topology decision itself is still
open as **A-50**.

### Why installs are separate repositories today

ADR-012 puts each install in its own repository. That is a deliberate trade: maximum isolation between a live store and product development, paid for with drift — every install must be brought forward by hand.

A-10 has landed, so the revisit is now due (**A-50**). Whatever is chosen, mixing store configuration back into the product repository is what produced the state this codebase spent a day repairing: another merchant's content on a live storefront, and a deploy workflow that pointed at somebody else's Worker.

---

## 11. What is still manual

The WordPress-like path now begins after Cloudflare resources exist. Sections 1–6
still require a terminal and Cloudflare credentials: create the Worker, D1, KV,
and R2 resources; attach the domain; configure bindings and secrets. The Worker
then applies its bundled schema automatically, redirects to `/install`, stores
runtime identity plus the operator credential, renders an explicit content setup
state, and supports runtime storefront definitions without a rebuild.

Infrastructure provisioning itself is not automated, and it is the whole of what
stands between this and a WordPress-style install. The claim gap this section
used to name — an exposed uninstalled Worker being taken by the first direct
`/api/install` caller — is closed: `src/pages/api/install.ts` requires the
`INSTALL_TOKEN` secret, refuses anything shorter than 16 characters, and compares
it in constant time. The open decisions are **A-50** (how a second install is
created), **A-51** (how an install learns it is behind) and **A-52** (whether the
product ships as a versioned artifact) in `TASKS.md`.
