# Release and Deployment — AdsBookCMS

> Verified against disk: 2026-08-17 @ `5cb1d32` + current A11 working tree

This document is the single owner of how a change reaches production. It replaces the previous `VERSION.md` runbook and the deleted `AUTO_UPDATE_DEPLOY.md`, which between them described three mutually exclusive release models, none of which matched the one workflow that exists.

---

## 1. The one release path

```
this repo:   push to main → .github/workflows/ci.yml → npm ci → npm run check → npm test → npm run build → stop
an install:  push to main → its own deploy workflow → …same gates… → npx wrangler deploy → live traffic
```

**In this repository, pushing to `main` deploys nothing.** CI runs check, test and build only; there are no Cloudflare credentials here and no deploy target.

Releasing means an install pulls this code into its own repository and deploys from there, against its own Worker, D1, KV, R2 and domain. In an install repository that carries the deploy workflow, **pushing to `main` does reach live traffic with no staging and no approval step**, so a merge there carries the same weight as running a deploy by hand.

The workflow triggers on push to `main`, on pull requests, and on manual
dispatch. It declares **no GitHub environment and no secrets** — those three
lines are the whole trigger block in `ci.yml`.

> The previous version of this section described a `CLOUDFLARE_API_TOKEN` GitHub
> environment and two Cloudflare secrets as if they existed here. They never
> did: that text belonged to the deleted `deploy.yml` and survived six lines
> below the sentence saying it had been removed. Keeping Cloudflare credentials
> out of this repository is the entire point of ADR-012, so a line implying they
> are already present is the most expensive kind of wrong — someone reconciling
> the document against reality would have *added* them.

### Manual deploy

`npx wrangler deploy` (or `npm run deploy`) deploys the working tree to whatever
Worker `wrangler.jsonc` names. In **this** repository that file is placeholders
(`example.com`, placeholder binding ids), so there is no production Worker to
reach; the command belongs in an install, run against that install's own
resources.

---

## 2. Gates before merging to `main`

Run in this order — it is the order CI runs them, so a failure here is a failure there:

```bash
npm test          # node --test over src/lib/*.test.ts
npm run check     # astro check && tsc --noEmit
npm run build     # astro build
```

Current verified working-tree baseline: **356 tests passing**, `tsc` clean, `astro check` 336 files, 0 errors / 0 warnings / 0 hints.

A green build is not proof the storefront works. For any browser-visible change, open the affected page before merging. Neither `tsc` nor `astro check` catches a route that fails to compose — an unterminated `.astro` frontmatter block silently produced a 404 on `/disclaimer` while every static check stayed green.

---

## 3. Database migrations

The Worker bundle contains the exact SQL from `src/db/migrations/`. Before a
database-backed request reaches route code, middleware validates `d1_migrations`
against that chain and atomically applies a valid missing suffix. Each migration's
statements and claim row execute in one D1 batch, so concurrent first requests
cannot claim success around a partial schema.

Operators may still apply the same chain explicitly as a preflight:

```bash
npm run db:migrate:local
npm run db:migrate:remote   # production D1 — approval required
```

Rules:

- **Never edit an applied migration in place.** Corrections ship as a new forward migration.
- **Write migrations by hand.** There is no generator; Drizzle was retired (ADR-005).
- **Keep every migration backward-compatible with the previous Worker bundle.** A Worker rollback cannot roll schema back.
- `src/db/migrations/` is the only migration directory.
- Invalid, unknown, or ahead history fails closed with `SCHEMA_UPGRADE_*`; never bypass the gate.

---

## 4. Version registry

Two registries, currently in step:

| Source | Field | Value |
| --- | --- | --- |
| `src/lib/version.ts` | `version` | `1.2.0` |
| `src/lib/version.ts` | `releaseTag` | `2026.08-hardened` |
| `src/lib/version.ts` | `schemaVersion` | `41` |
| `package.json` | `version` | `1.2.0` |

`src/lib/version.ts` is what the admin sidebar renders and is the value users
see. Keep it and `package.json` in step when bumping.

`schemaVersion` counts migration files, and the tree holds 41 (`0000`–`0040`).
`schema-version.test.ts` fails CI on drift; middleware enforces the same chain at
runtime; `operational-health.ts` and the dashboard expose applied version.

> This section previously declared the two drifted (`34` against `36`) and said
> `schemaVersion` was "read by nothing in `src/`". Both were false, and acting on
> them meant editing a correct constant until the test guarding it went red.

### Bumping a release

1. Update `src/lib/version.ts` (`version`, `releaseTag`, `lastUpdated`, and `schemaVersion` if migrations were added).
2. Record the change in `BUILD-LOG.md` as a new entry.
3. Update `STATUS.md` if the system state changed.
4. Merge to `main`. In this repository that ships nothing; an install picks the change up through §7.

---

## 5. Rollback

There is no automated rollback. Options, in order of preference:

1. **Revert the commit and merge** — goes through the same gates, and an install redeploys the previous behaviour when it next follows §7.
2. **Cloudflare dashboard rollback** to a previous Worker version — immediate, but the repository no longer matches production until you also revert in git.

**Migrations do not roll back.** A schema change that must be undone requires a new forward migration written for that purpose. Plan destructive schema changes accordingly.

---

## 6. What deploying does not do

- It does not require a separate migration command; runtime applies a valid missing suffix on the first database-backed request. An explicit preflight is still a separate approved production action.
- It does not seed or modify catalog data beyond forward migration logic.
- It does not rotate secrets. Worker secrets are set out of band and are never in `wrangler.jsonc`.
- It does not touch provider state at Mengantar or AutoLaris.

---

## 7. Updating an install from the product

This repository is the product; a store is a separate repository that shares history with it (ADR-012). Bringing a product change into a live store is therefore a merge followed by a deploy, performed **from the install's checkout**, never from here.

### Two shapes an install can take

**A. A local clone, no repository of its own.** The lightest form, and usually the right one. Clone this repository, point it at the store's resources, deploy. Cloudflare never asks where the code came from, so the store needs no GitHub repository at all — updates are `git pull` from this one.

```bash
git clone git@github.com:ongkipro/adsbookcms.git toko-b
cd toko-b
# edit wrangler.jsonc with this store's Worker name, D1/KV/R2 ids, and domains
npm ci && npm run build && npx wrangler deploy
```

**⚠ The hazard specific to this shape:** `origin` is the product. If the install's real `wrangler.jsonc` is committed and pushed, the store's live Worker name, database id, bucket and domains land in the product repository — and the next clone of the product inherits somebody's live infrastructure as its default. Prevent it in the clone:

```bash
git remote set-url --push origin DISABLED    # pulls still work; pushes fail loudly
```

Keep the store's configuration as an uncommitted local change, or commit it only on a branch that is never pushed.

**B. Its own repository.** Warranted when a store needs its own history, its own CI, or collaborators who must not see the product. `origin` is then the store, and this repository is added as a second remote named `product`.

Both shapes use the same update procedure below; only the remote name differs.

### One-time setup, per install clone

```bash
# shape B only — in shape A the product is already `origin`
git remote add product git@github.com:ongkipro/adsbookcms.git

git config merge.keepours.name "keep the install's own copy"
git config merge.keepours.driver true
git check-attr merge -- wrangler.jsonc     # expect: merge: keepours
```

The merge driver is what stops the product's placeholder `wrangler.jsonc` from replacing the install's real one. Git cannot ship a driver inside a repository, so this configuration lives in each clone and must be repeated on every machine. If it is missing, those files conflict instead — noisy, but safe.

### The procedure, in this order

```bash
git fetch product                       # or `git fetch origin` in shape A
git merge product/main                  # resolve conflicts; keep the install's config
npm ci                                  # only if the lockfile moved
npm run check && npm test               # gates, before touching anything live
npm run build                           # identity is runtime-owned; this is code only
npx wrangler deploy
# optional before deploy, when the operator wants explicit schema preflight:
npm run db:migrate:remote               # separate production approval
```

### Why the order is safe

**Runtime owns schema readiness.** A newly deployed Worker validates and applies
the bundled missing suffix before route code sees D1. Explicit migration remains
useful as a pre-deploy failure check, but it is not a hidden prerequisite for a
working install.

**Identity is not in the build.** It was, and gap G1 tracked that; the `stores`
row now owns it (migration `0036`, `readStoreIdentity`), resolved per request in
middleware. The `PUBLIC_SITE_*` vars in `wrangler.jsonc` are a fallback for a
store that has none, so a build carrying the product's placeholders no longer
produces a bundle stuck calling itself "Your Store" — but keep them accurate
anyway, because they are what an install shows before the wizard runs.

**Confirm the target before deploying.** `npx wrangler deploy --dry-run` prints the resolved Worker name, bindings and routes. If it prints `adsbookcms-your-store`, or a database id of all zeros, the merge overwrote the install's configuration — stop and restore it.

### What this procedure does not solve

It is manual, and nothing verifies that an install ran it. Drift between the product and its installs is the accepted cost of ADR-012, and closing it properly is task **A-51**; making the product an installable, versioned artifact is **A-52**.

---

## 8. Approval boundary

`main` is **not** production here (§1), but everything downstream of it is.
These require explicit approval before they happen:

- merging or pushing to `main` **in an install repository**, where it deploys;
- `npx wrangler deploy` / `npm run deploy`;
- `npm run db:migrate:remote` or any `--remote` D1 command;
- creating or deleting Cloudflare resources (D1, KV, R2, custom domains);
- any operation that mutates provider state at Mengantar or AutoLaris.

Read-only local work — tests, typecheck, build, local D1 — needs no approval.
