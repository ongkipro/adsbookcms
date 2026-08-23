# PLAN — AdsBookCMS install updates (manual copy)

**Status:** Decided (ADR-020). Security gate A-151 done; fleet-automation engine
withdrawn as YAGNI. This is a procedure, not a tool to build.

## 1. Authority

- Decision: `DECISIONS.md` ADR-020 (revised 2026-08-23).
- Product requirements: `PRD.md` A22, REQ-164 / REQ-167 / REQ-170 / REQ-172
  (the engine-specific REQs are withdrawn — see A22 note in `PRD.md`).
- Execution queue: `TASKS.md` A-151 (done), A-153 (manifest), A-159 (optional).
- Pre-remediation evidence: `docs/AUDIT-2026-08-23.md`.

## 2. Model

One store owns one repository, Worker, D1, KV, R2, domain, and credential set
(ADR-001/ADR-012). A new store is a copy of AdsBookCMS into a **new repo**,
deployed independently. This is the lightest, most Cloudflare-native shape: no
tenant routing, no shared data plane, strongest isolation, and each install runs
at full Worker + D1 capacity. Multi-tenant is rejected (weight/blast radius) and
a fleet updater engine is rejected (YAGNI at this scale).

An update is a **manual copy** of the product-owned paths of a tested product
revision into an install's own repo — nothing more.

## 3. The one artifact: path-ownership manifest (A-153)

Written: **`docs/UPDATE-PATH-OWNERSHIP.md`** — the full classification and the
copy-paste checklist. Summary:

- **Product-owned (copy on update):** `src/`, tests, `package.json` + lockfile,
  `src/db/migrations/`, product docs.
- **Install-owned (never overwrite):** `wrangler` config, Cloudflare / D1 / KV /
  R2 identifiers, secrets and `.dev.vars`, custom domain, merchant assets, and
  the install's own `RELEASE.md`.
- **Unknown path:** stop and classify it before copying — never blind-copy.

## 4. Update procedure (per install, manual)

1. On the product repo: land the change on `main`, pass `npm test` /
   `npm run check` / `npm run build`; that tested commit is the release.
2. In the install's repo: create a branch (e.g. `chore/adsbookcms-<version>`).
3. Copy the **product-owned** paths from the release into the install, following
   the manifest. Leave every install-owned path byte-identical.
4. Apply only the missing ordered migration suffix to the install's own D1 via
   the existing schema-upgrade contract (`npm run db:migrate:local` to verify).
5. Validate: `npm test`, `npm run check`, `npm run build`, fresh local D1
   migration.
6. Review the diff, then deploy that install (production deploy stays an
   explicit, install-owned action).
7. Record the adopted product ref + validation in the install's `RELEASE.md`.

Force-push, branch deletion, automatic merge, and automatic deploy are never
part of this procedure. A broken install never touches another store.

## 5. Database

Every install keeps its own D1. `src/db/migrations/` is the sole ordered schema
source; migrations are forward-only (a destructive migration needs its own
expand-and-contract plan before it ships). A migration failure stops that
install only. No row samples, customer identifiers, balances, or payment data
appear in any note or report.

## 6. Security gate (A-151 — done)

The audited HIGH raw-text JSON script breakout is closed: both storefront form
config scripts (`FormHybridContent.astro`, `FormMiddleContent.astro`) render
through `jsonForScript` (`src/lib/json-script.ts`), which escapes `<` as
`<` so a `productName` containing `</script>` cannot terminate the inline
`<script type="application/json">`. `src/lib/json-script.test.ts` is the
regression proof. Because the fix lives in product source, every future
copy-paste install carries it automatically.

## 7. When to revisit automation

Only if the install count grows past what manual copy can handle. Until then,
the fleet engine, target registry, canary runner, and automated rollout stay
unbuilt.
