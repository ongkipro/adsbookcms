# AdsBookCMS — Remaining Work and Blockers

> Verified against disk: 2026-08-16 @ `0a145c5`

This is the single ledger of work that is **not** done. Implemented behaviour belongs in `STATUS.md`, history in `BUILD-LOG.md`, accepted product behaviour in `PRD.md`, real architecture in `ARCHITECTURE.md`, and constraining decisions in `DECISIONS.md`.

Two rules govern every entry, per ADR-010:

1. **Disk wins.** Code, migrations, runtime configuration, and executed evidence outrank this file. When they disagree, fix this file.
2. **A missing contract is not a licence to invent one.** An absent provider specification never justifies inferring an endpoint, payload, authentication method, retry policy, or status enum.

---

## 1. Product Gaps — owned by the gap register

The seven open structural gaps between "the store that runs today" and "an installable product" live in **`ARCHITECTURE.md` §10** and are not restated here. In summary: **G1** build-time identity · **G2** no install wizard · **G3** no schema auto-upgrade · **G5** home content does not fail closed · **G6** compile-time theme set · **G7** no observability · **G8** broken Drizzle journal. **G4** is closed: migration `0034` removes the inherited sample row from a fresh schema.

Their governing decisions are ADR-003 (runtime identity), ADR-004 (install wizard), ADR-005 (raw SQL data layer), ADR-006 (neutral sample data), and ADR-007 (fail closed). G1 → G2 is the hard dependency: identity must resolve at runtime before a first-run wizard can write it.

Everything below is work the gap register does **not** cover: external provider contracts, the headless API surface, inherited-identity cleanup, merchant inputs, and operator-gated actions.

---

## 2. External Provider Blockers

These cannot be closed from inside this repository. Each needs a canonical provider document or an explicitly approved live capture.

| Subsystem | What is missing | Status | Verified boundary |
| --- | --- | --- | --- |
| Mengantar tracking | Synchronize shipped / delivered / returned state | **Blocked** | No canonical authenticated callback or polling contract, no retry semantics, no status mapping is available to this repository. |
| Mengantar wallet | Display live provider balance | **Blocked** | No canonical balance endpoint or verified response schema. `/admin/balance` is an AutoLaris D1 reconciliation ledger, not a provider wallet and not a withdrawal surface. |
| AutoLaris callback | Replace the configured shared-secret callback with the provider's official authentication/signature contract | **Blocked** | Payment creation, persistence, instruction rendering, and idempotent paid reconciliation all work. `/api/webhooks/autolaris` authenticates against `AUTOLARIS_WEBHOOK_SECRET`; the provider's official signature/header specification and replay rules are unavailable. |

Unknown or unauthenticated provider events **must fail closed** (ADR-007). Do not add a permissive branch to unblock testing.

### Closing a blocked contract

1. Obtain the canonical provider specification — endpoint, authentication, request/response schema, status enum, retry and idempotency semantics, replay window.
2. Implement inside the existing client boundary (`src/lib/mengantar-client.ts`, the AutoLaris webhook handler). Do not open a second HTTP path.
3. Persist provider identifiers and confirmed state **only** after an accepted response.
4. Keep local failure actionable; never present an unsynchronized D1 row as provider-confirmed.
5. Cover accepted, rejected, timeout, and retry paths with a runnable check.

---

## 3. Provider Work With a Verified Transport but an Incomplete Surface

### A. Non-COD unpaid recovery — transport done, operator surface missing

`MengantarClient.payUnpaidOrder(batchId, courierCode)` posts to `/order/pay-unpaid` (`src/lib/mengantar-client.ts:358`) and is covered by a test (`src/lib/mengantar-client.test.ts:114`). **Nothing calls it.** There is no admin action, no route, and no operator UI, so an order that came back from sequential dispatch with `isPaid: false` and no `cnote_no` is currently unrecoverable without leaving the product.

Remaining work:

1. Capture an explicitly approved real insufficient-wallet response to confirm the exact failure shape.
2. Verify `/order/pay-unpaid` authentication, idempotency, and failure semantics against that capture.
3. Expose a recovery action in `/admin/orders` or `/admin/shipping`, scoped to the verified state only.
4. Persist returned payment and waybill fields only after provider acceptance.

The blocker here is the operator surface plus a live capture — not the transport.

### B. Pickup address and schedule — implemented, needs contract re-verification and live proof

This is **implemented**, not pending. Both paths already follow accept-before-persist:

- `src/pages/api/admin/settings.ts:620` calls `ensurePickupAddress` before writing the `warehouses` row; a provider failure returns 502 (504 on timeout) with `"Data gudang lokal tidak diubah."` and D1 is left untouched.
- `src/pages/api/admin/shipping.ts:395` calls `schedulePickupTime`, requires a provider schedule reference in the response, and returns 502 `"Mengantar tidak mengembalikan referensi jadwal; D1 tidak diubah."` when it is absent.

What remains is not code:

1. Re-verify the `/address` and `/time` request/response schemas against current Mengantar documentation — they were implemented from an earlier reading.
2. Exercise the accepted, rejected, timeout, and duplicate-pickup paths against the live provider under explicit approval (see §6).

---

## 4. Headless API Surface — shipping, with real gaps

The `/api/v1/*` family is **implemented** — seven routes, key-authenticated, documented in `STOREFRONT_INTEGRATION.md` §4. It is no longer a planned contract and must not be listed as one. Note that `TASKS.md` T174 and T175 are stale: the bootstrap and catalog contracts they describe both ship.

Genuine remaining work on that surface:

| # | Item | Why it matters |
| --- | --- | --- |
| H4 | No per-key scoping, quota, or rate limit | Any valid key reaches every `/api/v1` route. Only `/api/v1/checkout` is rate-limited, and by client IP rather than by key. |
| H6 | No headless order-status read | An external storefront cannot poll payment state through `/api/v1`; only the session-authenticated `/api/order-status` exists. |
| H7 | No published API contract | No OpenAPI document, no client SDK, no versioning policy for `/api/v1`. |
| H8 | Executable storefront adapter | `STOREFRONT_INTEGRATION.md` §10 is a documentation brief, not a shipped adapter. Nothing packaged proves bootstrap → catalog → form handoff → confirmation → error mapping → attribution → accessible focus return end to end. |

### Cross-storefront consent

**Blocked on a merchant/legal decision; implementation planned.** Tracking validation and tag components exist, but no consent adapter propagates a consent decision across an external-storefront handoff. Consent state, tag load, browser event, install acceptance, Meta acceptance, attribution, and platform reporting must remain seven separately reportable facts. Checkout must stay usable when tracking is declined or unavailable.

---

## 5. Inherited-Identity Cleanup

Per ADR-002, remnants of the upstream multi-tenant engine and of previous merchants are to be **removed**, not preserved as compatibility boundaries.

| # | Remnant | Where | Note |
| --- | --- | --- | --- |
| C1 | `CONTENT_PACK_IDS` | `src/lib/tenant-contract.ts:5` | Exactly one value, `"runtime-managed"`, plus an `isTenantContentPackId` guard that can only ever return true for it. The whole mechanism is inert. There is no "legacy petanisejahtera content pack" and no compiled migration fallback keyed on one — delete the constant, the type, and the guard along with `PUBLIC_CONTENT_PACK` in `src/env.d.ts`. |
| C2 | `zanoby_click_ids` cookie | `src/lib/click-ids.ts:15`, `src/pages/embed/form.astro:78,82`, `src/lib/checkout-navigation.ts:39` | Load-bearing runtime string with three call sites. Renaming is a deliberate migration, not a find-and-replace: change the constant, both embed writers, and the reader in one commit, and ship a dual-read fallback first or accept losing click IDs captured under the old name. |
| C3 | `Zanoby Purchase` conversion label | `src/pages/admin/ads/google.astro:226` | Operator-facing copy naming a conversion action configured in a **Google Ads account**. Editing the string does not rename the conversion action; coordinate with whoever owns that account. |
| C4 | `petanisejahtera.com` test fixture | `src/lib/meta-capi.test.ts:37` | Test-only, no runtime effect. Replace with a neutral origin during the next touch of that test. |
| C5 | `PUBLIC_TENANT_SLUG` | `src/env.d.ts:11` | Declared, unset, unused. Remove with the identity work in G1/ADR-003. |
| C6 | `pnpm-lock.yaml` + `pnpm-workspace.yaml` | repo root | Per ADR-009, npm is authoritative. Both are to be deleted. |

---

## 6. Operator-Gated Actions

These are not engineering gaps. They require an explicit human decision and, where relevant, a rollback plan.

| Action | Gate |
| --- | --- |
| Live Mengantar side effects — order creation, pickup address, pickup schedule, unpaid recovery | Exact side-effect approval. Recent order and shipping audits deliberately avoided provider, payment, pickup, publish, and order mutations. |
| Live AutoLaris side effects — payment creation, callback replay | Exact side-effect approval. |
| Meta test events | Operator-provided test code plus explicit outbound-call approval. |
| Remote D1 migration (`npm run db:migrate:remote`) | Separate approval, independent of any deploy approval. |
| Production release | **Not possible from this repository.** It is the product: `.github/workflows/ci.yml` runs `npm ci → npm run check → npm test → npm run build` and stops. There are no Cloudflare credentials and no deploy target here (ADR-012). Releasing means an install pulls this code into its own repository and deploys from there, where merging to `main` does reach live traffic with no staging and no approval step. |
| Provisioning a second install in another Cloudflare account | Explicit approval. No installer exists (gap G2), so this is currently a manual Wrangler procedure and cannot be claimed as proven. |

---

## 7. Merchant Input and Runtime Publication

Repository implementation for the content workbench is complete; publication is runtime work performed by the merchant or operator, not by a commit.

1. Store a non-secret content instruction in the install's D1.
2. Generate or save a draft through `/admin/content`.
3. Review every factual claim, product reference, route, and media reference.
4. Upload merchant-owned media to the install's R2 bucket.
5. Publish each validated home and product record explicitly.
6. Exercise the resulting storefront and its metadata in a browser.

Product presentation already fails closed — an unpublished product is omitted from the storefront. Home content does **not** yet (gap G5), so an unpublished home silently serves compiled copy.

**Never seed production merchant instructions, credentials, claims, testimonials, ratings, or customer data into Git.**

---

## 8. Execution Order

1. **G1 → G2** identity at runtime, then the install wizard. Everything else in the gap register depends on or is cheapened by these.
2. **G5** make home content fail closed; a fresh install must not silently inherit compiled marketing copy (ADR-007).
3. **C1, C5, C6** delete the inert remnants. They are small, safe, and stop new code from being written against them.
4. **H4, H6, H7, H8** complete the remaining Headless API product surface: key scope and quota, order-status read, a published contract, and an executable adapter.
5. **G8** — closed 2026-08-16. Drizzle retired rather than repaired; see `DECISIONS.md` ADR-005.
6. **G7** add an `observability` block; nothing above can be diagnosed on a customer install without it.
7. **C2** the click-ID cookie migration, deliberately, with the dual-read fallback.
8. **§3A** the unpaid-recovery operator surface, after an approved live capture.
9. **§3B** re-verify the pickup contracts, then prove them live under approval.
10. **§2** resolve tracking, wallet, and AutoLaris signature blockers only from canonical provider documentation.
11. **H4, H6, H7, H8** and the consent adapter, once the installer product shape is settled.

---

## 9. Completion Rules

An entry is complete only when its contract, implementation, executable proof, failure behaviour, and owning canonical document are all updated together.

- A green `npm run build` is not evidence the UI works. Open it.
- A local build is not live-provider evidence.
- A Worker deployment is not D1 migration evidence.
- A Custom Domain is not data isolation by itself.
- A deleted Worker does not authorize deleting its D1, KV, R2, DNS, or secrets.
- A documented prompt is not an executable adapter.

Local verification, in the order CI runs it:

```bash
npm test          # node --test over src/lib/*.test.ts
npm run check     # astro check && tsc --noEmit
npm run build     # astro build
```
