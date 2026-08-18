# Observability — AdsBookCMS

> Verified against disk: 2026-08-17 @ `5cb1d32` + current A11 working tree

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
| Per-install schema alert | **Implemented**; scheduled every five minutes |
| Per-install CAPI outbox alert | **Implemented**; fires when failed/dead events exist or oldest pending age is at least 15 minutes |
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
| D1 query error while loading home content | `loadPublishedHomeContent` returns `null`; the storefront silently serves compiled fallback copy | A database outage looks like a working site with the wrong content |
| D1 error while reading embed origins | Middleware fails closed to an empty allowlist | Correct security behaviour, but embeds break with no signal |
| Meta CAPI delivery failure | Retried through `capi_event_outbox` with attempt counting | Good design — but nothing surfaces an outbox that has stopped draining |
| Mengantar dispatch failure | Order stays `pending` and remains retryable | Correct, but an operator must notice manually |
| Mengantar tracking poll failure | The affected row fails independently, remains at its prior lifecycle state, and returns an operator-visible error in the Shipping workspace | Correct interactive behavior; no automatic retry or alert is claimed |
| AutoLaris paid transaction with no operator confirmation yet | Order remains pending/unpaid until an owner/admin confirms the exact billed amount and provider reference from the provider dashboard | Correct current contract, but there is no automatic provider-side inquiry yet |
| Stock trigger rejection | `INSUFFICIENT_STOCK` raised by D1 | Surfaces to the caller, but is not counted |
| Landing pages fail to load on the homepage | `catch {}` swallowed it; the solutions grid silently loses every CMS landing page | Now logged as `home-landing-pages-load` |
| Support WhatsApp lookup finds no store row | returned `""`, identical to "number simply not saved" | Now logged as `storefront-support-whatsapp-no-store-row`, which distinguishes an unseeded database from an unconfigured one |
| Applied schema behind the code | nothing compared them; `schemaVersion` was read by nothing and drifted from 34 to 36 unnoticed | Now compared on `/admin/dashboard` and logged as `schema-version-mismatch`; a test reads the migration directory so adding one without bumping the constant fails CI |

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
schema/CAPI outbox alerting. `operational-health.ts` classifies Mengantar,
AutoLaris, and the CAPI outbox; `operational-alerts.ts` owns transition state and
notification delivery.

---

## 5. Alert state and notification contract

The scheduled handler evaluates:

- `schema`: firing on schema-history mismatch or read failure; healthy on an exact match.
- `capi-outbox`: firing when failed/dead rows are present or the oldest pending event is at least 15 minutes old; healthy otherwise.

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
`operational-alert-triggered` and `operational-alert-recovered`.
