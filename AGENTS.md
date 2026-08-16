# AGENTS.md — Working Agreement for AdsBookCMS

> Verified against disk: 2026-08-17 @ `PENDING`

This file is the contract for any AI coding agent or contributor working in this repository. Read it before the first edit.

**The product is AdsBookCMS (single):** a direct-response commerce CMS installed onto Cloudflare Workers, where **1 installer = 1 Worker = 1 store**. `permatamall.shop` is the reference instance, not the product name.

---

## 1. First principles

1. **The code wins.** When documentation and the tree disagree, the tree is right and the document is a bug to be fixed. This repository was forked from an upstream engine and its documentation described that other repository for months; assume nothing you have not verified.
2. **Never claim something works without running it.** `npm test`, `npm run check`, `npm run build`. For anything browser-visible, open the page — an unterminated `.astro` frontmatter block once produced a live 404 while every static check stayed green.
3. **State what you did not do.** Skipped verification, deferred scope, and unproven assumptions get named explicitly.
4. **This repository deploys nothing.** It is the product; CI runs check, test and build only. A live store deploys from its own install repository, against its own resources. Never add a deploy step or Cloudflare credentials here.

---

## 2. Document ownership

Exactly one document owns each subject. Do not restate another document's truth; link to it.

| Document | Owns |
| --- | --- |
| `README.md` | Repository entry point and orientation. Owns nothing else — it links |
| `AGENTS.md` | Working rules for anyone editing this repository, including this table |
| `ARCHITECTURE.md` | System structure, data layer, config resolution, gap register §10 |
| `DECISIONS.md` | Architecture decisions (ADR). Append-only |
| `RELEASE.md` | Deploy, migrations, versioning, rollback, approval boundary |
| `OBSERVABILITY.md` | Logging, failure visibility, what to enable |
| `INSTALLATION.md` | Standing up a new install |
| `STATUS.md` | Current state of the running system |
| `UNIMPLEMENTED_SPECS.md` | Remaining work and external blockers |
| `PRD.md` | Product requirements |
| `TASKS.md` | Execution log |
| `BUILD-LOG.md` | Chronological history. Append-only |
| `DESIGN-SYSTEM.md` | Visual contract |
| `STOREFRONT_INTEGRATION.md` | Headless `/api/v1/*` contract |
| `MENGANTAR_INTEGRATION_SPEC.md` | Courier provider boundary |
| `TRACKING_SPECS.md` | Ad signal contract |
| `PRD-ADMIN-LOGIN.md` | Admin login, first-run access, session |
| `docs/GOOGLE_ADS_SETUP.md` | Google Ads / Merchant Center setup |

Every document carries a `> Verified against disk: <date> @ <sha>` line, this one
included. If you change what a document describes, update that line or the
document is lying about its own freshness. A rewritten history orphans every SHA
those headers cite, so re-stamp them all when `main` is re-founded — sixteen
documents were left pointing at commits reachable only from
`backup/pre-history-rewrite`.

**This table is the only copy.** `README.md` links to it rather than repeating
it; the two drifted apart the last time both carried a list, which is the exact
failure mode this section exists to prevent.

---

## 3. Invariants — do not break these

**Commerce**
- Checkout never dispatches to a courier. Orders land as `pending`; an operator releases them explicitly from `/admin/orders`.
- Paid status changes dispatch *eligibility*, never dispatch itself.
- Price, stock, weight, and identity come from D1. Browser state is never pricing authority.
- Stock non-negativity is enforced by a database trigger, not application code. Do not work around it.

**Config**
- Binding names are fixed: `OMS_DB`, `SESSION`, `ASSET_BUCKET`, `AI`, `ASSETS`.
- Provider credentials are D1-first, env-fallback. Never echo a stored credential back through a browser API.
- Meta CAPI tokens are server-only. Browser and server Purchase share one per-order `event_id`.

**Content**
- Product presentation does **not** fail closed, and that is deliberate: an active product with no published content still renders, described from its own title, category and variants. What must never happen is copy belonging to a different product or a different merchant reaching it — that is the invariant, not omission.
- No merchant's content, brand, contact details, or media may ship for a different merchant. This has gone wrong before and reached production.

**Data**
- `src/db/migrations/` is the only description of the schema. There is no `schema.ts` and no generator.
- Migrations are hand-authored.
- Never edit an applied migration in place. Corrections are new forward migrations. The single documented exception is `0017`, which had to be edited because it aborted the chain on a fresh database — read its header before considering another.

---

## 4. Verification

```bash
npm test          # node --test over src/lib/*.test.ts
npm run check     # astro check && tsc --noEmit
npm run build     # astro build
```

On a fresh clone, run `npm run check` rather than bare `npx tsc --noEmit`. `astro check` generates `.astro/types.d.ts` first; without it `tsc` reports phantom errors such as `Property 'env' does not exist on type 'ImportMeta'`.

Baseline on `main`: **303 passing**, 0 type errors, `astro check` 0 errors / 0 warnings / 0 hints. A change that reduces this baseline is not done.

New non-trivial logic — a branch, a parser, a money or auth path — leaves one runnable check behind. Trivial one-liners do not need a test.

`src/lib/auth.ts` is covered by `src/lib/auth.test.ts` (14 tests, mutation-verified). That suite asserts security *properties* — a tampered signature is rejected, a rotated credential closes the session, a role never reaches a route it should not. Keep it that way: a test that merely asserts a valid token is valid buys nothing.

---

## 5. Approval gates

Ask before: `wrangler deploy` or any `--remote` D1 command — both act on a real install and neither belongs to this repository; creating or deleting Cloudflare resources; anything that mutates provider state at Mengantar or AutoLaris; reading or printing secrets; deleting data; pushing to a branch that an install deploys from.

Pushing to `main` **here** deploys nothing (ADR-012), so it is ordinary work — but adding a deploy step or Cloudflare credentials to this repository is not, and must never be done.

Local work — tests, typecheck, build, local D1, reading code — needs no approval.

A permitted command is not an approved one. The tooling here runs with broad permissions; the boundary is behavioural.

---

## 6. Code discipline

Smallest change that is correct. Reuse what exists before adding; the codebase already has 68 lib modules and duplicating one is the most common failure mode.

Before adding a dependency, check whether the platform already provides it. Two headless UI libraries already ship side by side (`radix-ui` and `@base-ui/react`) — do not add a third.

Fix root causes, not symptoms. Grep every caller before editing a shared function: one guard in the shared path is a smaller diff than one guard per call site, and patching only the path in front of you leaves siblings broken.

Deliberate corner-cuts get a `// lazy:` comment naming the ceiling and the upgrade path.

---

## 7. Things that are wrong on purpose right now

Do not "fix" these silently or treat them as bugs to be surprised by — they are known, tracked, and have decisions attached:

- Home content falls back to built-in copy instead of failing closed (`G5`, ADR-007). The fallback is composed from this store's own identity and logs `home-content-unpublished`; it is still not an honest setup state.
- `theme_color`, `locale` and `admin_name` are stored per install but have no admin editor yet.
- The admin session cookie is `adsbook_session`, declared once as `SESSION_COOKIE_NAME` in `src/lib/auth.ts`. Never write the literal string; a writer and reader that disagree is a silent lockout.
- The click cookie is `adsbook_click_ids`. The former `zanoby_click_ids` is still **read** as a fallback so an upgrading install does not lose 90 days of in-flight attribution. Never write the legacy name; it ages out on its own.
- Newly issued developer API keys carry `adsbook_live_`. Keys issued as `cmsads_live_` still validate — the stored value is a SHA-256 digest, so the prefix never took part in matching, and rewriting it would have broken them. The legacy prefix survives only in `maskApiKeySecret` so an old key still renders a coherent preview.

---

## 8. Language

Repository artifacts — documentation, code comments, commit messages — are written in **English**. User-facing product copy is Indonesian. Do not translate quoted UI strings or third-party interface labels.
