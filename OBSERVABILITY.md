# Observability — AdsBookCMS

> Verified against disk: 2026-08-16 @ `0a145c5`

This document describes what can and cannot currently be observed about a running install. It is deliberately blunt about the gaps, because for an installable product the inability to diagnose someone else's install is a product defect, not a nice-to-have.

---

## 1. Current state: essentially none

**`wrangler.jsonc` has no `observability` block.** Cloudflare Workers Logs are therefore off. There is no log retention, no queryable history, and no way to answer "what happened on this install at 14:20 yesterday" after the fact.

What exists:

| Capability | Status |
| --- | --- |
| Workers Logs / Logpush | **Not configured** |
| Error reporting (Sentry or equivalent) | **None** |
| Uptime / synthetic checks | **None** |
| Structured logging | **Partial** — 76 `console.error` calls with stable string labels |
| Request tracing / correlation id | **None** |
| Business metrics | Present, but only as a live D1 query in `/admin/dashboard` |
| Alerting | **None** |

The only way to see a runtime error today is `npx wrangler tail` while the error is happening, which requires knowing in advance that something is wrong.

---

## 2. What the code already does right

Error logging follows a consistent convention worth preserving: a stable kebab-case label as the first argument, then the error object.

```ts
console.error("storefront-support-whatsapp-load", error);
```

Roughly 40 distinct labels are in use, named after the surface that produced them — `admin-products-patch`, `autolaris-webhook`, `mengantar-dispatch-lease-release`, `shipping-pickup`, `settings-put`, `google-catalog-xml-error`, and so on. These are already greppable and would become queryable the moment Workers Logs is enabled. **Keep this convention.** A new log line without a stable label is a log line nobody will ever find.

Three `console.log` calls exist and should be reviewed — informational logging in a Worker costs money at scale and usually indicates leftover debugging.

---

## 3. Failure modes that are currently silent

These are the paths where the system degrades without telling anyone. Each is a real behaviour in the current tree, not a hypothetical.

| Failure | Current behaviour | Why it matters |
| --- | --- | --- |
| D1 query error while loading home content | `loadPublishedHomeContent` returns `null`; the storefront silently serves compiled fallback copy | A database outage looks like a working site with the wrong content |
| D1 error while reading embed origins | Middleware fails closed to an empty allowlist | Correct security behaviour, but embeds break with no signal |
| Meta CAPI delivery failure | Retried through `capi_event_outbox` with attempt counting | Good design — but nothing surfaces an outbox that has stopped draining |
| Mengantar dispatch failure | Order stays `pending` and remains retryable | Correct, but an operator must notice manually |
| AutoLaris webhook signature mismatch | Rejected | No counter distinguishes "provider changed contract" from "nobody paid today" |
| Stock trigger rejection | `INSUFFICIENT_STOCK` raised by D1 | Surfaces to the caller, but is not counted |
| Landing pages fail to load on the homepage | `catch {}` swallowed it; the solutions grid silently loses every CMS landing page | Now logged as `home-landing-pages-load` |
| Support WhatsApp lookup finds no store row | returned `""`, identical to "number simply not saved" | Now logged as `storefront-support-whatsapp-no-store-row`, which distinguishes an unseeded database from an unconfigured one |
| Applied schema behind the code | nothing compared them; `schemaVersion` was read by nothing and drifted from 34 to 36 unnoticed | Now compared on `/admin/dashboard` and logged as `schema-version-mismatch`; a test reads the migration directory so adding one without bumping the constant fails CI |

The pattern across all of them: the system is **correctly defensive** and **completely silent**. Defensive degradation without telemetry converts an outage into a slow-burning content or revenue bug.

---

## 4. What to enable first

Ordered by value per unit of effort.

1. **Turn on Workers Logs.** Add to `wrangler.jsonc`:
   ```jsonc
   "observability": { "enabled": true, "head_sampling_rate": 1 }
   ```
   This alone makes the existing 76 labelled error calls queryable, with zero code changes.

2. **Log the outbox depth.** A single periodic count of `capi_event_outbox` rows in `status != 'delivered'` distinguishes a healthy pipeline from a stalled one. This is the metric most likely to silently cost money, because a stalled outbox means unattributed ad spend.

3. **Distinguish degradation from success.** Where the code falls back — home content, support WhatsApp, embed origins — log a labelled warning on the fallback path. Today those paths are indistinguishable from the happy path in every observable way.

4. **Surface provider health in `/admin`.** Last successful Mengantar call, last AutoLaris callback received, last CAPI delivery. The data already exists in D1; nothing reads it as a health signal.

5. **Uptime check on `/` and `/produk`.** External, per install.

---

## 5. Per-install consideration for AdsBookCMS

Once there is more than one install, observability stops being a single-site concern:

- Logs are **per Worker**. There is no aggregate view across installs unless one is built, and building one means shipping telemetry off the install, which is a decision with privacy consequences that must be made deliberately (see `DECISIONS.md`).
- **Order and customer data must never leave the install** as part of any telemetry. Counts, durations, and error labels are safe; payloads are not.
- Each install carries its own `src/lib/version.ts`. Any future health endpoint should report version and applied schema version, because "which version is this customer actually running" is otherwise unanswerable without shell access.

This gap is tracked as **G7** in `ARCHITECTURE.md` §10.

---

## 6. Diagnosing a live install today

Until the above lands, the available tools are:

```bash
npx wrangler tail                                    # live log stream, nothing retained
npx wrangler d1 execute OMS_DB --remote --command "…" # read-only inspection (approval required)
curl -s -o /dev/null -w '%{http_code} %{time_total}' https://<domain>/
```

`/admin/dashboard` gives live business state (revenue, orders, conversion, payment mix, RTS indicators) computed directly from D1 on each load. It is a dashboard, not a monitor: it shows the present, keeps no history, and alerts on nothing.
