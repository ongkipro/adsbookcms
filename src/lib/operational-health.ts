import {
  CAPI_MAX_BACKOFF_MS,
  readCapiDeliveryWindow,
  readCapiOutboxDepth,
  type CapiDeliveryWindow,
  type CapiOutboxDepth,
} from "./capi-outbox.ts";
import { getEnvValue, getRuntimeEnv } from "./env.ts";
import {
  GOOGLE_ADS_MAX_BACKOFF_MS,
  readGoogleAdsOutboxDepth,
  type GoogleAdsOutboxDepth,
} from "./google-ads-offline.ts";
import { getSchemaVersionStatus } from "./schema-version.ts";
import { CMS_VERSION } from "./version.ts";

/**
 * Operational health for `/admin`.
 *
 * `OBSERVABILITY.md` §4 item 4: the data already exists in D1 and nothing reads
 * it as a health signal. Four signals, one query each, every query bounded so
 * an operator refreshing the dashboard cannot make the store slower.
 *
 * Three states, deliberately:
 *   healthy  — the most recent recorded outcome for this signal was a success.
 *   degraded — attempts are recorded and none of the recent ones succeeded.
 *   unknown  — nothing is recorded at all, or the table could not be read.
 *
 * `unknown` is not a soft `degraded`. A provider that has never been contacted,
 * a store that has taken no orders, and a payment gateway nobody has paid
 * through yet are all *normal*. Colouring them red produces an alarm nobody
 * trusts, which is worse than no alarm.
 *
 * Nothing here returns customer or order content. Counts, timestamps and
 * states only — per `OBSERVABILITY.md` §5, payloads must never leave an install.
 */

export type HealthState = "healthy" | "degraded" | "unknown";

export type HealthSignalId =
  | "capi-outbox"
  | "meta-capi"
  | "mengantar"
  | "autolaris"
  | "google-ads-outbox"
  | "alerting";

export type HealthSignal = {
  id: HealthSignalId;
  state: HealthState;
  /** Stable kebab-case cause, matching the repo's log-label convention. */
  reason: string;
  /**
   * The timestamp this signal reports. For `capi-outbox` it is the *oldest*
   * undelivered row (a backlog age); for every other signal it is the most
   * recent success (a freshness age).
   */
  lastAt: string | null;
  ageMinutes: number | null;
  metrics: Record<string, number>;
};

export type OperationalHealth = {
  checkedAt: string;
  overall: HealthState;
  signals: HealthSignal[];
  build: {
    version: string;
    releaseTag: string;
    expectedSchemaVersion: number;
    appliedSchemaVersion: number | null;
    schemaState: string;
  };
};

/** Rows inspected by each bounded provider read. */
export const PROVIDER_WINDOW = 200;

export type MengantarWindow = {
  rowsScanned: number;
  lastDispatchedAt: string | null;
  failedInWindow: number;
};

export type AutoLarisWindow = {
  rowsScanned: number;
  lastOutboundAt: string | null;
  lastPaidAt: string | null;
  failedInWindow: number;
};

function ageMinutes(at: string | null, now: number): number | null {
  if (!at) return null;
  const parsed = Date.parse(at);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, Math.round((now - parsed) / 60_000));
}

function signal(
  id: HealthSignalId,
  state: HealthState,
  reason: string,
  lastAt: string | null,
  now: number,
  metrics: Record<string, number> = {},
): HealthSignal {
  return { id, state, reason, lastAt, ageMinutes: ageMinutes(lastAt, now), metrics };
}

/**
 * How much conversion signal Meta is owed.
 *
 * A terminal failure is money already lost — the conversion will never reach
 * Meta and the ad account is optimising without it. A backlog that is merely
 * waiting out its backoff is normal; one that is past every retry window and
 * still sitting is a drain that has stopped running.
 */
export function classifyCapiOutbox(
  depth: CapiOutboxDepth | null,
  now: number,
): HealthSignal {
  if (!depth) return signal("capi-outbox", "unknown", "unreadable", null, now);

  const metrics = {
    pending: depth.pending,
    failed: depth.failed,
    overdue: depth.overdue,
  };
  const oldest = depth.oldestCreatedAt;
  if (depth.pending + depth.failed === 0) {
    return signal("capi-outbox", "healthy", "empty", null, now, metrics);
  }
  // Both conditions are reported, because they are different problems with
  // different responses and one used to hide the other: `failed > 0` returned
  // first, so a queue that was *also* stalled read as nothing but terminal
  // failures. Terminal rows are already lost; stalled rows are still
  // recoverable and nothing is moving them.
  const oldestAge = oldest ? now - Date.parse(oldest) : 0;
  const stalled = depth.overdue > 0 && oldestAge > CAPI_MAX_BACKOFF_MS;
  if (depth.failed > 0) {
    return signal(
      "capi-outbox",
      "degraded",
      stalled ? "stalled-with-terminal-failures" : "terminal-failures",
      oldest,
      now,
      metrics,
    );
  }
  if (stalled) {
    return signal("capi-outbox", "degraded", "stalled", oldest, now, metrics);
  }
  return signal("capi-outbox", "healthy", "draining", oldest, now, metrics);
}


/**
 * How much conversion signal Google is owed.
 *
 * The Google outbox shipped with no health signal at all, and that absence had
 * a cost: a head-of-line block in reconciliation stopped discovery entirely and
 * nothing reported it (`UNIMPLEMENTED_SPECS.md`, task A-227). The shape mirrors
 * `classifyCapiOutbox` deliberately — the two queues fail the same way and an
 * operator should not have to learn two vocabularies.
 */
export function classifyGoogleAdsOutbox(
  depth: GoogleAdsOutboxDepth | null,
  now: number,
): HealthSignal {
  if (!depth) return signal("google-ads-outbox", "unknown", "unreadable", null, now);

  const metrics = {
    pending: depth.pending,
    failed: depth.failed,
    overdue: depth.overdue,
  };
  const oldest = depth.oldestCreatedAt;
  if (depth.pending + depth.failed === 0) {
    return signal("google-ads-outbox", "healthy", "empty", null, now, metrics);
  }
  const oldestAge = oldest ? now - Date.parse(oldest) : 0;
  const stalled = depth.overdue > 0 && oldestAge > GOOGLE_ADS_MAX_BACKOFF_MS;
  if (depth.failed > 0) {
    return signal(
      "google-ads-outbox",
      "degraded",
      stalled ? "stalled-with-terminal-failures" : "terminal-failures",
      oldest,
      now,
      metrics,
    );
  }
  if (stalled) {
    return signal("google-ads-outbox", "degraded", "stalled", oldest, now, metrics);
  }
  return signal("google-ads-outbox", "healthy", "draining", oldest, now, metrics);
}

/**
 * Whether anything can actually tell the operator.
 *
 * The scheduled Worker evaluates every signal above hourly and sends firing and
 * recovery events to `OPS_ALERT_WEBHOOK_URL`. When that is unset the evaluation
 * still runs and the transitions still compute — they simply go nowhere, and
 * the dashboard becomes the only channel, which means somebody has to think to
 * look.
 *
 * That is not hypothetical. On a sibling install a Meta outage turned
 * `capi-outbox` degraded within the hour and ran two days before anyone opened
 * the panel. The system knew the whole time and had no way to say so, because
 * the variable had never been set.
 *
 * Reported as `unknown`, not `degraded`. A store may legitimately decide it
 * does not want webhooks, and this module's own rule is that colouring a
 * deliberate choice red produces an alarm nobody trusts. Amber with an explicit
 * reason says the thing that matters — nothing will be sent — without crying
 * wolf on every refresh.
 */
export function classifyAlerting(
  webhookConfigured: boolean,
  now: number,
): HealthSignal {
  return webhookConfigured
    ? signal("alerting", "healthy", "configured", null, now)
    : signal("alerting", "unknown", "not-configured", null, now);
}

/** When Meta last accepted an event. */
export function classifyCapiDelivery(
  window: CapiDeliveryWindow | null,
  now: number,
): HealthSignal {
  if (!window) return signal("meta-capi", "unknown", "unreadable", null, now);
  const metrics = { rowsScanned: window.rowsScanned };
  if (window.rowsScanned === 0) {
    // No conversion has ever been enqueued. Not a failure — an unused pipeline.
    return signal("meta-capi", "unknown", "never-enqueued", null, now, metrics);
  }
  if (!window.lastDeliveredAt) {
    return window.lastFailedAt
      ? signal("meta-capi", "degraded", "never-delivered", null, now, metrics)
      : signal("meta-capi", "unknown", "no-delivery-in-window", null, now, metrics);
  }
  if (window.lastFailedAt && window.lastFailedAt > window.lastDeliveredAt) {
    return signal("meta-capi", "degraded", "failing", window.lastDeliveredAt, now, metrics);
  }
  return signal("meta-capi", "healthy", "delivered", window.lastDeliveredAt, now, metrics);
}

/**
 * When Mengantar last accepted a shipment.
 *
 * `orders.provider_dispatched_at` is written only when a dispatch was accepted
 * (`resolveAcceptedMengantarShipment`). Failures write `provider_dispatch_error`
 * but no timestamp, so they can be counted and not dated — which is why a
 * window with successes reads healthy and only a window with attempts and no
 * success reads degraded.
 */
export function classifyMengantar(
  window: MengantarWindow | null,
  now: number,
): HealthSignal {
  if (!window) return signal("mengantar", "unknown", "unreadable", null, now);
  const metrics = {
    rowsScanned: window.rowsScanned,
    failedInWindow: window.failedInWindow,
  };
  if (window.rowsScanned === 0) {
    return signal("mengantar", "unknown", "no-orders", null, now, metrics);
  }
  if (!window.lastDispatchedAt) {
    return window.failedInWindow > 0
      ? signal("mengantar", "degraded", "all-attempts-failed", null, now, metrics)
      : signal("mengantar", "unknown", "never-dispatched", null, now, metrics);
  }
  return signal("mengantar", "healthy", "dispatched", window.lastDispatchedAt, now, metrics);
}

/**
 * When AutoLaris was last reached and when an operator last verified payment.
 *
 * Outbound: a `payment_transactions` row that received a
 * `provider_transaction_id` proves AutoLaris accepted a Create Order call.
 * `paid_at` is written by either guarded Advice reconciliation or the audited
 * manual fallback. Payments created but never paid are not an upstream outage.
 */
export function classifyAutoLaris(
  window: AutoLarisWindow | null,
  now: number,
): HealthSignal {
  if (!window) return signal("autolaris", "unknown", "unreadable", null, now);
  const metrics = {
    rowsScanned: window.rowsScanned,
    failedInWindow: window.failedInWindow,
  };
  if (window.rowsScanned === 0) {
    return signal("autolaris", "unknown", "never-used", null, now, metrics);
  }
  if (!window.lastOutboundAt) {
    return window.failedInWindow > 0
      ? signal("autolaris", "degraded", "create-failing", null, now, metrics)
      : signal("autolaris", "unknown", "no-accepted-request", null, now, metrics);
  }
  if (!window.lastPaidAt) {
    // Not "unknown": the provider has accepted requests, so there IS data and
    // the badge must not say "Belum ada data" beside eleven transactions.
    // What has not happened yet is a confirmed payment. That is a healthy
    // integration awaiting a buyer, not a missing one.
    return signal(
      "autolaris",
      "healthy",
      "awaiting-first-payment",
      window.lastOutboundAt,
      now,
      metrics,
    );
  }
  return signal(
    "autolaris",
    "healthy",
    "payment-confirmed",
    window.lastPaidAt,
    now,
    metrics,
  );
}

/** Worst state wins, and `degraded` outranks `unknown`: a fault is louder than a blank. */
export function summarizeHealth(signals: HealthSignal[]): HealthState {
  if (signals.some((entry) => entry.state === "degraded")) return "degraded";
  if (signals.some((entry) => entry.state === "unknown")) return "unknown";
  return "healthy";
}

/**
 * lazy: bounded reverse-rowid scan of the newest `PROVIDER_WINDOW` orders.
 * `provider_dispatched_at` is not indexed, so `MAX(...)` over the whole table
 * would read every order on every refresh. Ceiling: a dispatch older than the
 * last 200 orders reads as "none recorded". Upgrade path: index
 * `orders(provider_dispatched_at)` in a forward migration and drop the window.
 */
async function readMengantarWindow(
  database: D1Database,
): Promise<MengantarWindow | null> {
  try {
    const row = await database
      .prepare(
        `SELECT
           COUNT(*) AS rows_scanned,
           MAX(provider_dispatched_at) AS last_dispatched_at,
           SUM(
             CASE WHEN provider_dispatch_error IS NOT NULL
                   AND provider_dispatch_error <> 'DISPATCHING'
             THEN 1 ELSE 0 END
           ) AS failed_in_window
         FROM (
           SELECT provider_dispatched_at, provider_dispatch_error
           FROM orders ORDER BY id DESC LIMIT ?
         )`,
      )
      .bind(PROVIDER_WINDOW)
      .first<{
        rows_scanned: number | null;
        last_dispatched_at: string | null;
        failed_in_window: number | null;
      }>();
    return {
      rowsScanned: Number(row?.rows_scanned ?? 0),
      lastDispatchedAt: row?.last_dispatched_at ?? null,
      failedInWindow: Number(row?.failed_in_window ?? 0),
    };
  } catch (error) {
    console.error("operational-health-mengantar-unreadable", error);
    return null;
  }
}

/**
 * lazy: same bounded window, same reason — neither transaction `created_at` nor
 * `paid_at` is indexed for this exact query. `created_at` rather
 * than `updated_at` dates the outbound call independently of reconciliation.
 */
async function readAutoLarisWindow(
  database: D1Database,
): Promise<AutoLarisWindow | null> {
  try {
    const row = await database
      .prepare(
        `SELECT
           COUNT(*) AS rows_scanned,
           MAX(CASE WHEN provider_transaction_id IS NOT NULL THEN created_at END) AS last_outbound_at,
           MAX(paid_at) AS last_paid_at,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_in_window
         FROM (
           SELECT pt.provider_transaction_id, pt.created_at, pt.paid_at, pt.status
           FROM payment_transactions pt
           ORDER BY pt.id DESC LIMIT ?
         )`,
      )
      .bind(PROVIDER_WINDOW)
      .first<{
        rows_scanned: number | null;
        last_outbound_at: string | null;
        last_paid_at: string | null;
        failed_in_window: number | null;
      }>();
    return {
      rowsScanned: Number(row?.rows_scanned ?? 0),
      lastOutboundAt: row?.last_outbound_at ?? null,
      lastPaidAt: row?.last_paid_at ?? null,
      failedInWindow: Number(row?.failed_in_window ?? 0),
    };
  } catch (error) {
    console.error("operational-health-autolaris-unreadable", error);
    return null;
  }
}

/**
 * Four bounded reads, run together. Each returns null on failure rather than
 * throwing, so one unreadable table reports `unknown` for its own signal
 * instead of blanking the whole panel.
 */
export async function collectOperationalHealth(
  database: D1Database,
  locals?: App.Locals,
): Promise<OperationalHealth> {
  const [depth, delivery, mengantar, autolaris, googleAdsDepth, schema] = await Promise.all([
    readCapiOutboxDepth(database),
    readCapiDeliveryWindow(database),
    readMengantarWindow(database),
    readAutoLarisWindow(database),
    readGoogleAdsOutboxDepth(database),
    getSchemaVersionStatus(locals),
  ]);

  const now = Date.now();
  const signals = [
    classifyCapiOutbox(depth, now),
    classifyCapiDelivery(delivery, now),
    classifyMengantar(mengantar, now),
    classifyAutoLaris(autolaris, now),
    classifyGoogleAdsOutbox(googleAdsDepth, now),
    classifyAlerting(
      Boolean(getEnvValue("OPS_ALERT_WEBHOOK_URL", getRuntimeEnv(locals))?.trim()),
      now,
    ),
  ];

  return {
    checkedAt: new Date(now).toISOString(),
    overall: summarizeHealth(signals),
    signals,
    build: {
      version: CMS_VERSION.version,
      releaseTag: CMS_VERSION.releaseTag,
      expectedSchemaVersion: schema.expected,
      appliedSchemaVersion: schema.applied,
      schemaState: schema.state,
    },
  };
}
