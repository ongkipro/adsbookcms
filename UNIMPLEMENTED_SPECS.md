# AdsBookCMS — Remaining Work and Blockers

> Reviewed against disk: 2026-08-18 @ `0af225b` on `feat/admin-access-dashboard`.

This is the single ledger of work that is **not** done. Implemented behaviour belongs in `STATUS.md`, history in `BUILD-LOG.md`, accepted product behaviour in `PRD.md`, real architecture in `ARCHITECTURE.md`, and constraining decisions in `DECISIONS.md`.

Two rules govern every entry, per ADR-010:

1. **Disk wins.** Code, migrations, runtime configuration, and executed evidence outrank this file. When they disagree, fix this file.
2. **A missing contract is not a licence to invent one.** An absent provider specification never justifies inferring an endpoint, payload, authentication method, retry policy, or status enum.

All ten structural gaps in `ARCHITECTURE.md` §10 are closed. This file now owns only audited defects, incomplete product surfaces, documentation debt, and external blockers.

---

## 1. Audited Engineering Gaps

| ID | Severity | Gap | Completion boundary |
| --- | --- | --- | --- |
| AD3 | Medium | Product-grain Google feed items still map the first variant's merchant-editable internal SKU to MPN while declaring `identifier_exists` as `no`; products with no sellable variant disappear instead of retaining a stable `out_of_stock` item. | Separate internal SKU from standard identifiers, define the product-level price/availability fallback contract, retain stable out-of-stock items when truthful data exists, and cover Google and Meta XML with executable fixtures. |
| COD1 | Medium | This store computes its COD service fee locally (`payment-fee-policy.ts`: 3% plus 11% VAT, each rounded up) while Mengantar returns its own `codFee` on every quote that asks for it. Measured against the live account on 2026-08-19 the two disagree at every amount sampled — Rp50.000, Rp100.000, Rp199.000, Rp333.333 and Rp1.000.000 all came back exactly **one rupiah below** the local figure. The buyer is billed the local number. | Decide whether the local policy is a deliberate store markup or an attempt to mirror the provider. If it mirrors, take the provider's quoted `codFee` as the billed figure instead of recomputing it, so a provider rate change cannot silently diverge; if it is the store's own price, say so in the policy and stop treating the gap as a rounding bug. This is a pricing decision, not an engineering one, so nothing was changed. |
| S1 | Medium | `theme_color`, `locale`, and `admin_name` resolve from D1 but have no complete operator editor. | Add validated fields to the existing store settings boundary and verify runtime rendering without a rebuild. |
| DOC1 | Low | `DESIGN-SYSTEM.md` still describes deleted components, old font/CSS ownership, build-time tenant fallback, and historical gate counts. | Re-extract it from the current component and style tree instead of incrementally restamping stale sections. |

Closed by the A10 work and 2026-08-18 production hardening recorded in `BUILD-LOG.md`: canonical single/bulk order transitions; exactly-once stock restoration on cancellation/deletion; non-destructive dispatched-order deletion; atomic order numbers; abandoned-order abuse controls and retention; bank-transfer verification; submit-boundary payment policy; canonical Meta Purchase identity and paid-state gates; runtime schema upgrades; fresh-install home fail-closed; runtime storefront definitions; Headless scopes, quotas, final-response audits, and public order status; per-install schema/CAPI alerting; one-time install capability; public provider rate limits with server-owned origin; and migration-owned settings schema.

---

## 2. Headless API Deliverables

Nine `/api/v1/*` routes ship with hashed developer keys, independent origin policy, minimum per-operation scopes, D1-backed per-key quotas, payload-free write audits, token-scoped public order status, and an authenticated OpenAPI 3.1 document at `/api/v1/openapi.json`. `STOREFRONT_INTEGRATION.md` §4 is the human-readable contract.

| ID | Item | Why it remains |
| --- | --- | --- |
| H9 | Cross-storefront consent handoff | No accepted merchant/legal contract defines how consent state crosses an external storefront handoff. Checkout must remain usable when tracking is declined or unavailable. |

---

## 3. External Provider Blockers

These cannot be closed from this repository alone. Each needs canonical provider documentation or an explicitly approved live capture.

| Subsystem | Missing contract | Verified boundary |
| --- | --- | --- |
| Mengantar tracking live proof | Accepted, missing, malformed, timeout, and representative shipped/delivered/RTS responses from the active account | Operator-triggered authenticated polling, sequential isolation, raw evidence persistence, and monotonic status mapping are implemented and locally tested. No callback contract is assumed; no live provider read was performed in this change. |
| Mengantar wallet | Canonical balance endpoint and response schema | `/admin/balance` is an AutoLaris D1 reconciliation ledger, not a provider wallet. |
| AutoLaris settled-payment shape | The response `POST /api/h2h/advice` returns for a transaction that has actually been paid, plus its expired and failed shapes | Superseded on 2026-08-19. The provider's published H2H collection documents `POST /api/h2h/advice` taking `{ "transaction_id": "..." }`, and it was exercised against the provider's published development key: a freshly created, unpaid transaction returns `{"rc":"02","ket":"PENDING","data":{"awb":""}}`. `AutoLarisClient.inquirePayment` implements that read and classifies **only** `rc: "02"` as `pending`; every other code is `unproven` and cannot move payment state. No settled transaction has been observed, because observing one means paying a real virtual account. Until that shape is captured, owner/admin manual confirmation stays the sole path that marks an AutoLaris payment paid. The transport is ready and tested; the scheduled confirmation workflow is not built. The earlier entry claimed no read-only inquiry endpoint existed at all — it does. It also recorded `POST /api/h2h/submit` as the creation path, which was wrong for this product — `/submit` is the combined shipping-and-payment path and requires AutoLaris' own `id_area` district identifiers, which no order in this repository holds. |
| AutoLaris production IP allowlist | Which egress addresses an install presents to AutoLaris | The provider's documentation requires production API access to be allowlisted to at most five IP addresses. Cloudflare Workers do not offer a fixed egress address, so no install can be declared AutoLaris-production-ready on this evidence. The development key is unrestricted, which is why every capture above was taken with it. This is an infrastructure decision, not a code change. |
| Mengantar unpaid recovery | Real insufficient-wallet response plus verified `/order/pay-unpaid` response shape, idempotency, and failure semantics | Automatic `/order/create` dispatch is a separate contract. A provider-created unpaid draft may retain its accepted provider order ID with no cnote and be visible under **Perlu Dibuatkan Resi**, but `MengantarClient.payUnpaidOrder` has no verified internal operator action. No local flow may fabricate or persist a waybill before provider acceptance. |
| Mengantar pickup proof | Current `/address` and `/time` schemas plus live accepted/rejected/timeout/duplicate evidence | Existing handlers already call provider-before-persist and leave D1 unchanged on provider failure. |

### Closing a blocked contract

1. Obtain the canonical specification or an explicitly approved capture: endpoint, authentication, schemas, status enum, retry/idempotency semantics, and replay window.
2. Implement inside the existing provider client or admin reconciliation boundary; do not open a second HTTP path.
3. Persist provider identifiers and confirmed state only after provider acceptance.
4. Keep local failure actionable; never present an unsynchronized D1 row as provider-confirmed.
5. Cover accepted, rejected, timeout, and retry paths with a runnable check.

---

## 4. Inherited Identity and Account-Coupled Copy

One known row remains: `Zanoby Purchase` in `src/pages/admin/ads/google.astro` names a conversion action configured in a Google Ads account. Editing repository copy does not rename that remote conversion action; coordinate the change with the account owner.

The legacy `zanoby_click_ids` cookie remains a read-only 90-day attribution fallback by deliberate compatibility decision. New writes use `adsbook_click_ids`; remove the fallback only after the upgrade window has elapsed.

---

## 5. Operator-Gated Actions

These are not engineering gaps. They require an explicit human decision and, where relevant, a rollback plan.

| Action | Gate |
| --- | --- |
| Live Mengantar side effects — order creation, pickup address, pickup schedule, unpaid recovery | Exact side-effect approval |
| Live AutoLaris side effects — payment creation or payment-state mutation | Exact side-effect approval |
| Meta test events | Operator-provided test code plus explicit outbound-call approval |
| Remote D1 preflight (`npm run db:migrate:remote`) | Separate production-data approval; runtime auto-upgrade does not authorize it |
| Install-repository deployment | Explicit production approval; this product repository itself has no deploy target or credentials |
| Provisioning another Cloudflare account/install | Explicit infrastructure approval |
| Scrubbing local or remote warehouse/provider identifiers | Explicit destructive-data approval |

---

## 6. Execution Order

1. Keep automatic AutoLaris paid marking disabled until a **settled**
   `POST /api/h2h/advice` response has been observed and the scheduled Worker
   path is proven against it. The inquiry transport now exists and is proven
   for the pending case only; the current accepted production-safe fallback
   remains owner/admin manual confirmation with immutable audit evidence.
2. Resolve Mengantar provider blockers only from canonical documentation or
   approved sandbox/live evidence.
3. **AD3** define and implement stable, truthful out-of-stock feed behavior and
   standard-identifier policy.
4. **S1** complete the runtime store identity editor.
5. **DOC1** rebuild the design-system record from the current tree.
6. Implement **H9** only after the consent contract is accepted.

---

## 7. Completion Rules

An entry is complete only when its contract, implementation, executable proof, failure behaviour, and owning canonical document are updated together.

- A green build is not evidence a UI works; open it.
- A local build is not live-provider evidence.
- Runtime migration success on local D1 is not remote-D1 approval.
- A Custom Domain is not data isolation by itself.
- A deleted Worker does not authorize deleting its D1, KV, R2, DNS, or secrets.
- A documented prompt is not an executable adapter.

Local gates, in CI order:

```bash
npm run check
npm test
npm run build
```
