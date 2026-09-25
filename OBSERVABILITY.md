# Observability — AdsBookCMS

> Verified against disk: 2026-09-25 @ `6e30950` + audit working tree

This document describes what an operator can observe and what AdsBookCMS now alerts on for one running install. Cross-install aggregation and an external uptime probe remain separate decisions.

---

## 1. Current state: retained logs plus actionable per-install alerts

`wrangler.jsonc` enables Workers Logs at full sampling, so labelled application
errors and scheduled-maintenance events are retained and queryable after the fact.
The Worker also owns one scheduled maintenance trigger (`*/5 * * * *`). It checks
schema history and CAPI outbox age, persists signal transition state under
`adsbookcms:operational-alert:v1:*` in the `SESSION` KV binding, and sends
deduplicated firing/recovery events to `OPS_ALERT_WEBHOOK_URL` when that
HTTPS URL is configured. Missing notification configuration is explicit
`notification: "disabled"` state, never simulated success.

External uptime monitoring and a fleet-wide view are not implemented.

What exists:

| Capability | Status |
| --- | --- |
| Workers Logs / Logpush | **Configured** in `wrangler.jsonc` |
| Request logs | **On**, with invocation logs retained |
| Structured application errors | **Implemented** for labelled server and provider failures |
| Per-install schema alert | **Implemented**; evaluated by the hourly cron (`7 * * * *`) and on the request that meets a schema failure |
| Per-install CAPI and Google Ads outbox alerts | **Implemented**; fire when terminal failures exist or an overdue row is older than the one-hour maximum backoff |
| Deduplication and recovery | **Implemented** through KV transition state |
| Notification transport | **Implemented** for an operator-configured HTTPS URL |
| External uptime check | **Absent** |
| Cross-install monitor | **Absent** |
| Alert dashboard/history | **Absent** beyond KV state and retained logs |

`npx wrangler tail` remains the live view; retained logs and KV alert state provide
the after-the-fact view.

---

## 2. What the code already does right

Error logging follows a consistent convention worth preserving: a stable kebab-case label as the first argument, then the error object.

```ts
console.error("storefront-support-whatsapp-load", error);
```

Roughly 85 distinct labels are in use, named after the surface that produced them — `admin-products-patch`, `manual-payment-reconciliation`, `mengantar-dispatch-lease-release`, `shipping-pickup`, `settings-put`, `google-catalog-xml-error`, and so on. Workers Logs is enabled, so these labels are queryable during the configured retention window. **Keep this convention.** A new log line without a stable label is a log line nobody will ever find.

Three `console.log` calls exist and should be reviewed — informational logging in a Worker costs money at scale and usually indicates leftover debugging.

---

## 3. Current degradation gaps and resolved signals

These are the paths where the system degrades without telling anyone. Each is a real behaviour in the current tree, not a hypothetical.

| Failure | Current behaviour | Why it matters |
| --- | --- | --- |
| D1 query error while loading home content | `getTenantHomeContent` resolves `unavailable` and the home renders its unavailable state; no compiled copy exists to fall back to | Visible as a degraded home, not disguised as content |
| D1 error while reading embed origins | Middleware fails closed to an empty allowlist | Correct security behaviour, but embeds break with no signal |
| Meta CAPI delivery failure | Retried through `capi_event_outbox` with attempt counting, and `capi-outbox` reports depth, overdue rows and last delivery as both a health signal and an alert | The Meta side is the model the Google side below should follow |
| Google Ads offline conversion delivery | `google_ads_conversion_outbox` retries like the Meta outbox and reports depth, overdue rows and terminal failures as the `google-ads-outbox` health signal **and** alert (A-227 + 2026-09-25). An account-level 401/403 stops the batch and leaves rows pending (`google-ads-offline-access-denied`) | Before this, a head-of-line block uploaded nothing while the cron logged `queuedGoogleAdsConversions: 0` (A-182, BUILD-LOG 89) |
| Mengantar dispatch failure | Order stays `pending` and remains retryable | Correct, but an operator must notice manually |
| Mengantar tracking poll failure | The affected row fails independently, remains at its prior lifecycle state, and returns an operator-visible error in the Shipping workspace | Correct interactive behavior; no automatic retry or alert is claimed |
| AutoLaris paid transaction | The hourly Advice inquiry marks it paid on `rc:"00"` plus an allowlisted settlement word; an unrecognised word is logged in `operational-health-scheduled` as `unrecognisedPaidStatuses`, and the owner/admin can still reconcile by hand | The first real settled response is still unobserved (SCR1) |
| Stock trigger rejection | Inert since ADR-023: nothing writes stock, so `INSUFFICIENT_STOCK` cannot be raised | — |
| Landing pages fail to load on the homepage | `catch {}` swallowed it; the solutions grid silently loses every CMS landing page | Now logged as `home-landing-pages-load` |
| Support WhatsApp lookup finds no store row | returned `""`, identical to "number simply not saved" | Now logged as `storefront-support-whatsapp-no-store-row`, which distinguishes an unseeded database from an unconfigured one |
| Applied schema behind the code | nothing compared them; `schemaVersion` was read by nothing and drifted from 34 to 36 unnoticed | Now compared on `/admin/dashboard` and reported through the `schema` alert (`schema-database-behind` and siblings); a test reads the migration directory so adding one without bumping the constant fails CI |

The pattern across all of them: the system is **correctly defensive** and **completely silent**. Defensive degradation without telemetry converts an outage into a slow-burning content or revenue bug.

---

## 4. What to enable first

Ordered by value per unit of effort.

1. **Alert on outbox health.** Implemented by the scheduled CAPI outbox signal.
2. **Distinguish degradation from success.** Most critical degradation paths
   carry labels; the remaining silent fallbacks are tracked in
   `UNIMPLEMENTED_SPECS.md`, not treated as alert success.

3. **Uptime check on `/` and `/produk`.** External, per install.

4. **Cross-install view.** Logs and alert state remain per Worker. Aggregation
   would ship telemetry off an install and therefore requires an explicit privacy
   and operating-model decision.

**Done since this list was written:** provider health in `/admin` and scheduled
schema, CAPI outbox and Google Ads outbox alerting. `operational-health.ts`
classifies Mengantar, AutoLaris, both conversion outboxes and whether alerting
is configured; `operational-alerts.ts` owns transition state and
notification delivery.

---

## 5. Alert state and notification contract

The scheduled handler evaluates:

- `schema`: firing on schema-history mismatch or read failure; healthy on an exact match.
- `capi-outbox` and `google-ads-outbox`: firing when a row failed terminally **in the last 24 hours** or an overdue row is older than the one-hour maximum backoff (`stalled`); healthy otherwise. Older failures read `earlier-failures`: still counted on the panel, no longer holding the alert open — which used to deduplicate the next outage into silence for the 30 days failed rows are kept.

A repeat of a still-pending firing state is not re-written to KV (it would be one write per request during a schema outage), and the webhook POST is bounded to 5 seconds.

`unknown` does not overwrite a previously known state. A healthy→firing transition
persists before notification. A failed notification remains `pending` so the next
scheduled run retries; a successful notification becomes `sent`. A
firing→healthy recovery emits once and returns to healthy state.

Webhook JSON is bounded and payload-free: `event_id`, `id`, `state`, `reason`,
`transition`, and `transition_at`. It never includes order, customer, payment,
credential, or request payloads.

Logs and alert state remain per Worker. There is no aggregate view across installs.
Building one means shipping telemetry off the install, so order and customer data
must never leave the install; only counts, durations, version, and error labels are
eligible for any future design.

---

## 6. Diagnosing a live install today

The available operator tools are:
```bash
npx wrangler tail                                      # live stream
npx wrangler d1 execute OMS_DB --remote --command "…" # read-only inspection (approval required)
curl -s -o /dev/null -w '%{http_code} %{time_total}' https://<domain>/
```

`/admin/dashboard` gives live business state computed directly from D1. It is not
an alert console: it shows the present and keeps no alert history.
For alert delivery failures, query Workers Logs for
`operational-alert-notification-failed`; for transitions, use
`operational-alert-firing` and `operational-alert-recovered`.

Labels added on 2026-08-27 (ADR-021), all `console.error`, none carrying a
client address, username, or order payload:

| Label | Meaning |
| --- | --- |
| `rate-limit-store-failed` | The `rate_limits` D1 write or read threw; the request was allowed through (fail open). `bucket` names the limit |
| `admin-session-read-failed` | The `admin_sessions` join threw; the request was treated as signed out |
| `location-cache-read-failed` / `location-cache-write-failed` | KV location cache unavailable — typically `KV put() limit exceeded for the day`; the lookup still answers from the provider or catalogue |
| `public-location-search-failed` | `/api/locations` answered 500. Previously a silent catch: the 2026-08-27 fleet outage was invisible in logs because of it |
| `public-order-status-failed` / `public-payment-retry-failed` | `/api/order-status` failed, or a buyer-requested payment regeneration did |
| `autolaris-fee-mismatch` | The provider billed a total other than the one computed from `payment-fee-policy.ts`; the fee table needs updating |
| `autolaris-callback-recorded` / `autolaris-callback-store-failed` | A provider callback was stored in `autolaris_callbacks` (with the `reff_id`/`trx_id` it carried), or could not be. Read the table with `wrangler d1 execute`; nothing acts on it (ADR-022) |
| `paid-order-purchase-failed` | A manual paid confirmation succeeded but the server Meta Purchase could not be enqueued; the confirmation stands |
| `scheduled-*-failed` (`abandoned-order-purge`, `rate-limit-purge`, `payment-expiry`, `callback-purge`, `notification-purge`, `capi-outbox-purge`, `capi-drain`, `google-ads-reconcile`, `google-ads-drain`, `autolaris-advice`) | One step of the hourly cron threw; every later step still ran. `operational-health-scheduled` reports `-1` for that step |
| `scheduled-google-ads-purge-failed` | The 30-day retention purge of settled/failed Google rows threw; nothing else was affected |
| `google-ads-offline-access-denied` | The Ads API answered 401/403 for the account; the batch stopped with rows left pending for the next run |
| `autolaris-callback-rate-limited` | A callback was refused by the per-address (30/min) or store-wide (600/h) ceiling; `global: true` names the latter |

If `KV put() limit exceeded for the day` appears at all, the account's shared
Free-plan KV allowance is exhausted: nothing user-facing fails any more, but the
caches it feeds are cold until the daily reset.
