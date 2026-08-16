# Mengantar Integration — Technical Contract and Gap Register

> Verified against disk: 2026-08-17 @ `d5f3cd8`

This document is the technical source of truth for AdsBookCMS behavior at the Mengantar boundary. It separates repository-observed transport code, locally verified application behavior, operator-gated live mutations, and provider contracts that remain unknown.

AdsBookCMS installs as **one Worker = one store**, so every statement below describes a single install's provider credentials and D1 database. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the install model and [`DECISIONS.md`](./DECISIONS.md) (ADR-001, ADR-002) for why there is no tenant abstraction in code.

Normative product behavior lives in `PRD.md` (`REQ-40`–`REQ-46`). Earlier revisions of this line cited `REQ-38`, `REQ-74`, `REQ-75` and `REQ-76`, none of which exist, and `REQ-13`–`REQ-16`, which are about home content, templates, feeds and ratings. Current evidence lives in `STATUS.md`; genuine remaining work lives in `UNIMPLEMENTED_SPECS.md` and in the gap register in `ARCHITECTURE.md` §10.

## 1. Boundary and Authentication

### Observed repository contract

- Production base URL default: `https://api-public.mengantar.com`.
- API prefix: `/api/public/{API_KEY}`.
- The store resolves its Mengantar API key and HTTP(S) base URL from D1 first, then from server environment fallback (`getProviderConfig`).
- Public browser code never receives the API key.
- JSON order creation uses `Content-Type: application/json`.
- Pickup address and time mutations use `Content-Type: application/x-www-form-urlencoded`.
- **Every** request made through `MengantarClient.requestJson()` sets `x-client-source: directCall` unless the caller has already supplied that header (`src/lib/mengantar-client.ts`). This is shipped, live behavior asserted by `src/lib/mengantar-client.test.ts`. Do not remove or rename it without confirming the provider's expected integrator classification first — the header is part of the active integration contract, not a proposal.
- Requests are bounded by an `AbortController` timeout configured on the client instance.

### Security and isolation

- Provider credentials belong to one install's Worker/D1 pair and must not be copied to another install.
- Read APIs must not echo raw keys. Admin configuration exposes only configured/source state and masked values.
- Unknown provider responses, unauthenticated callbacks, and unrecognized status values fail closed.
- Live order, pickup, wallet, or payment mutations require explicit side-effect approval.

## 2. Endpoint Status Matrix

Status distinguishes three separate things: whether the **transport method** exists on `MengantarClient`, whether an **application path** calls it, and whether an **operator UI** can trigger it.

| Provider endpoint | Method | Purpose | AdsBookCMS status | Active boundary |
| --- | --- | --- | --- | --- |
| `/address/search?keyword=` | `GET` | Resolve Mengantar area identities | Implemented and locally verified | Public checkout starts with the bundled district index; server/admin flows resolve provider district/subdistrict data before quoting or dispatch. |
| `/address` | `GET` | List seller pickup addresses | Transport implemented | `getPickupAddresses()` exists; provider synchronization is not presented as complete. |
| `/address` | `POST` | Create or update pickup address | Implemented (`PRD.md` REQ-44) | `createPickupAddress()` exists. Persist provider-confirmed identity only after an accepted response. |
| `/time` | `POST` | Schedule pickup | Implemented (`PRD.md` REQ-44) | `schedulePickupTime()` exists. A local D1 schedule is not provider confirmation. |
| `/time?address=` | `GET` | List pickup times | Transport implemented | `getPickupTimes()` exists; no complete synchronized admin lifecycle is claimed. |
| `/order/estimate` | `GET` | Quote retail courier services | Implemented and locally verified | Read-only quote used by checkout, order editing, and admin tariff checks; a quote is never a shipment. |
| `/order/allEstimate3PL` | `GET` | Quote base 3PL pricing | Not implemented | No transport method, application path, or UI. |
| `/getReceiverScoreByNumberUser` | `GET` | Return receiver history per courier | Implemented and locally verified | AdsBookCMS derives transparent delivery rate/risk from provider counts; it does not fabricate a provider score. |
| `/order` | `POST` | Create provider order/draft and optional waybill | Implemented; live mutation gated | Only explicit eligible Push actions in Order Management may invoke it. Bulk calls run sequentially with per-order outcomes. |
| `/order/pay-unpaid` | `POST` | Recover accepted non-COD unpaid draft | **Transport implemented and unit-tested; no operator UI** | `payUnpaidOrder(batchId, courierCode)` exists in `src/lib/mengantar-client.ts` and is covered by `src/lib/mengantar-client.test.ts`. It is called by no route and no admin component, so the recovery workflow cannot be triggered in production. See §5F. |
| Wallet balance | Unknown | Read active Mengantar wallet | Blocked | No canonical endpoint or response schema is verified; do not assume `/user/balance`. |
| Tracking synchronization | Unknown | Reconcile shipment lifecycle | Blocked | No authenticated callback/polling contract, status enum, or retry behavior is verified. |

## 3. Area Search and Quote Resolution

### Public checkout

1. `GET /api/locations?search=<prefix>` searches the bundled 7,285-district index (`src/data/indonesia-districts.ts`, derived from Kepmendagri No. 300.2.2-2138 Tahun 2025) without exposing provider credentials.
2. The customer selects one district plus city; public checkout does not require village selection.
3. The server resolves a representative Mengantar destination area identity through `/address/search` using the selected district plus city, not the ambiguous district name alone. Exact district representatives rank ahead of village rows.
4. `/api/shipping-options` requests eligible rates from `/order/estimate`.
5. Order submission re-fetches and verifies courier, service, cost, weight, active variant, and destination before persistence.

The local district index improves public search relevance; it is not a replacement for the provider identity required by rates and dispatch.

### `/api/locations` parameters

`src/pages/api/locations.ts` reads `search`, `level`, `province`, and `city`.

- `search` is required and must be at least two characters after trimming; anything shorter returns an empty list.
- `level` is **not an enum**. The handler branches on exactly one value: `level === 'resolve'`. Any other value — including no value at all — takes the same default path. There is no `level=district` mode; passing it is indistinguishable from omitting the parameter.
- `level=resolve` **with** a `city` value builds multi-attempt provider searches (`buildProviderDestinationSearches`), stops early once a district/city match resolves, and returns `resolved` rows with `alternatives` as fallback. The default path instead runs one provider search and applies `sortLocationResults`.
- Without a D1 binding or without a configured Mengantar API key, the handler degrades to the bundled district catalog only.
- Results are de-duplicated by ID and capped at 50 rows.

### Admin warehouse and order editing

- Warehouse origin selection groups provider results by district and then requires a precise subdistrict/village selection before persisting `origin_area_id` and its label.
- Customer checkout remains district-only and never displays kelurahan/desa in its delivery summary; the server still resolves a representative real Mengantar area ID for rates and dispatch.
- The order editor defaults to the same bundled district-plus-city search and resolves the selected pair to one representative provider area identity. An operator may explicitly enable direct provider kelurahan/desa precision when the buyer address needs it. Both modes persist a real `destination_area_id`, then re-quote the actual provider price; neither mode permits free-text or unresolved destination dispatch.

### Rate interpretation

- `unsupported: true` means the courier route is unavailable and must not be offered.
- `unsupported_cod: true` means the route may be available but COD must not be offered.
- AdsBookCMS persists and verifies the selected provider quote; browser-supplied cost is never authoritative.
- `/order/estimate` is a read operation. It does not create, reserve, or prove a shipment.

## 4. Receiver Performance

`GET /getReceiverScoreByNumberUser` returns courier-specific history rather than one canonical 0–100 score. AdsBookCMS parses provider buckets such as total, delivered, RTS, undelivered, and in-progress counts.

Behavior:

- normalize the customer phone before the request;
- preserve the full courier breakdown and observation timestamp;
- derive delivery rate from completed outcomes using the documented local policy;
- classify operational risk as locally derived guidance, not a provider-issued score;
- refresh checkout snapshots through Cloudflare `waitUntil()` so customer persistence does not wait on the read-only provider lookup;
- avoid fabricated fallback scores when the provider is unavailable.

## 5. Definitive Order-to-Shipment Lifecycle

### A. Intake

- Every checkout endpoint persists the order, items, and stock transition atomically in D1.
- New orders use `shipping_status = pending` and remain in Order Management.
- COD, an eligible quote, and an authenticated AutoLaris paid transition do not call Mengantar automatically.

### B. Order Management verification

Before confirmation, the operator verifies:

- customer identity and deliverable address;
- resolved destination area identity and label;
- active warehouse and pickup data;
- selected supported courier/service and current public price;
- payment readiness: COD is not payment-gated, while online methods require reconciled paid state.

An explicit Push action in Order Management is the provider boundary. Selection alone is inert. Single and bulk actions call the Order Management API; Shipping does not create provider orders.

### C. Sequential dispatch from Order Management

- The backend validates ownership, pending status, payment eligibility, destination, warehouse, courier/service, and existing provider state again.
- Each `/order` request is awaited before the next begins. Parallel calls and guessed fixed delays are prohibited.
- Every selected order returns an independent `success`, `unpaid`, `skipped`, or `failed` result with an actionable reason.
- Accepted siblings remain committed when another order fails.
- Provider rejection or transport failure clears the dispatch claim, preserves the provider error, and leaves the order `pending` in Order Management for correction and retry.
- A stale dispatch claim becomes retryable after the same bounded lease used by the dispatcher.

### D. Provider-accepted Shipping projection

Only an explicit response with `success: true` may persist provider identity, set `shipping_status = processing`, record confirmation, and make the order visible in Shipping. Shipping owns:

- provider-returned resi visibility;
- shipment lifecycle status after creation;
- pickup selection and scheduling for eligible provider-created rows.

### E. Accepted response semantics

- Persist `provider_order_id`, batch identity, paid state, and `cnote_no` only for the individual accepted response.
- A provider-accepted non-COD draft may have `isPaid: false` and `cnote_no: null`.
- An absent `cnote_no` remains visibly absent; AdsBookCMS never fabricates a waybill or labels an unpaid draft as dispatched.

### F. Non-COD unpaid recovery — transport ready, workflow missing

The `/order/pay-unpaid` transport is **implemented**, not blocked:

- `payUnpaidOrder(batchId, courierCode)` posts `{ batch_id, courier }` as JSON to `/order/pay-unpaid`;
- it inherits the shared `x-client-source`, timeout, and response-parsing behavior of every other client method;
- `src/lib/mengantar-client.test.ts` asserts both the header and the call.

What is missing is everything above the transport: no API route calls `payUnpaidOrder()`, no Shipping or Order Management control exposes it, there is no persisted record of a recovery attempt, and no idempotency guard prevents a double payment if a retry raced. An operator therefore cannot recover an unpaid draft from the product today.

Before a recovery workflow ships, verify against the live account: the exact accepted/rejected response shape for a real unpaid draft, idempotency behavior on repeat calls, and what the provider returns when payment succeeds but waybill issuance is delayed or absent.

## 6. Pickup Synchronization

Observed client fields for `/address` include:

- `PICKUP_NAME`;
- `PICKUP_PIC`;
- `PICKUP_PIC_PHONE`;
- `PICKUP_ADDRESS`;
- `PICKUP_AUTOFILL` provider area identity;
- optional existing address identity for update.

Observed client fields for `/time` include `address_id`, `date` in `MM-DD-YYYY`, and a provider time value.

### Pickup scheduling constraint — enforced in code

The 90-minute lead time is **not merely documented**; `src/pages/api/admin/shipping.ts` rejects the request before any provider call:

```ts
const minimumPickupTime = Date.now() + 90 * 60 * 1000;
```

A requested slot earlier than `now + 90 minutes`, or an invalid warehouse ID, returns HTTP 400 with the operator-facing message `"Slot pickup 09.00–18.00 WIB harus dimulai minimal 90 menit dari sekarang."`. The same handler validates the slot through `resolveMengantarPickupSlot()` and caps a batch at 1–100 shipments.

This is a locally enforced application rule derived from the available integration reference. It bounds our own requests; it is not proof that the provider applies the identical threshold. Confirm the provider-side minimum before relaxing or tightening the local value.

Remaining work for full pickup synchronization:

1. focused request/response verification for the active provider account;
2. explicit accepted/rejected/timeout handling;
3. provider identity persisted only after acceptance;
4. retry behavior that cannot duplicate pickup creation;
5. UI language that distinguishes local D1 schedule from provider-confirmed pickup.

## 7. Blocked Contracts

These have no transport method and no verified provider contract.

### Tracking synchronization

Required before implementation:

- canonical callback or polling endpoint;
- authentication or signature verification;
- status enum and transition rules;
- retry, duplicate, and ordering behavior;
- mapping for shipped, delivered, returned, and terminal exceptions.

### Live wallet balance

Required before implementation:

- canonical endpoint and method;
- authentication;
- response schema, amount units, and currency;
- error and stale-data semantics.

## 8. Sandbox Reference

When an approved sandbox test is performed, preserve the known environment limitations as test preconditions rather than production rules:

1. JNE sandbox origin may require Jakarta mapping.
2. SAP sandbox tests may require non-COD Jakarta-to-Jakarta routing.
3. Sandbox wallet top-up may require the Midtrans sandbox simulator.

Re-check these constraints against the active sandbox documentation before treating a failure as an application regression.

## 9. Verification and Evidence Boundary

Repository-level proof currently covers payload construction, response parsing, eligibility, sequential execution, leases/claims, partial outcomes, persistence rules, local API behavior, and responsive single/bulk Shipping controls. Recent browser audits intentionally did not submit live provider mutations.

Relevant implementation owners:

- `src/lib/mengantar-client.ts` — transport, `x-client-source`, timeout, response parsing;
- `src/lib/mengantar-order.ts`;
- `src/lib/mengantar-dispatch.ts`;
- `src/lib/payment-dispatch-policy.ts` — payment eligibility for dispatch;
- `src/lib/location-search.ts` and `src/lib/district-catalog.ts` — area resolution helpers;
- `src/data/indonesia-districts.ts` — the bundled 7,285-district index;
- `src/pages/api/admin/orders/[id].ts`;
- `src/pages/api/admin/shipping.ts` — pickup scheduling and the 90-minute rule;
- `src/pages/api/locations.ts`;
- `src/pages/api/shipping-options.ts`.

Run the repository's own commands rather than preserving historical counts:

```bash
npm test
npm run check
npm run build
```

A green unit test or build is not live-provider evidence. Record exact endpoint, side effect, request class, accepted/rejected outcome, and non-actions whenever a live scenario is explicitly approved.
