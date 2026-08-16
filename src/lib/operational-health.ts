import {
  CAPI_MAX_BACKOFF_MS,
  readCapiDeliveryWindow,
  readCapiOutboxDepth,
  type CapiDeliveryWindow,
  type CapiOutboxDepth,
} from "./capi-outbox.ts";
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
  | "autolaris";

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
  lastCallbackAt: string | null;
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
  if (depth.failed > 0) {
    return signal("capi-outbox", "degraded", "terminal-failures", oldest, now, metrics);
  }
  const oldestAge = oldest ? now - Date.parse(oldest) : 0;
  if (depth.overdue > 0 && oldestAge > CAPI_MAX_BACKOFF_MS) {
    return signal("capi-outbox", "degraded", "stalled", oldest, now, metrics);
  }
  return signal("capi-outbox", "healthy", "draining", oldest, now, metrics);
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
 * When AutoLaris was last reached, in each direction.
 *
 * Outbound: a `payment_transactions` row that received a
 * `provider_transaction_id` proves AutoLaris accepted a create-payment call.
 * Inbound: `paid_at` is written only by the webhook, so it proves a callback
 * arrived. Payments created but never paid is "nobody paid yet", not a fault —
 * `OBSERVABILITY.md` §3 names exactly that confusion.
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
  if (!window.lastCallbackAt) {
    return signal(
      "autolaris",
      "unknown",
      "awaiting-first-callback",
      window.lastOutboundAt,
      now,
      metrics,
    );
  }
  return signal(
    "autolaris",
    "healthy",
    "callback-received",
    window.lastCallbackAt,
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
 * lazy: same bounded window, same reason — neither `created_at` nor `paid_at`
 * on `payment_transactions` is indexed. `created_at` rather than `updated_at`
 * dates the outbound call, because the webhook bumps `updated_at` too and would
 * make an inbound callback masquerade as an outbound success.
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
           MAX(paid_at) AS last_callback_at,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_in_window
         FROM (
           SELECT provider_transaction_id, created_at, paid_at, status
           FROM payment_transactions ORDER BY id DESC LIMIT ?
         )`,
      )
      .bind(PROVIDER_WINDOW)
      .first<{
        rows_scanned: number | null;
        last_outbound_at: string | null;
        last_callback_at: string | null;
        failed_in_window: number | null;
      }>();
    return {
      rowsScanned: Number(row?.rows_scanned ?? 0),
      lastOutboundAt: row?.last_outbound_at ?? null,
      lastCallbackAt: row?.last_callback_at ?? null,
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
  const [depth, delivery, mengantar, autolaris, schema] = await Promise.all([
    readCapiOutboxDepth(database),
    readCapiDeliveryWindow(database),
    readMengantarWindow(database),
    readAutoLarisWindow(database),
    getSchemaVersionStatus(locals),
  ]);

  const now = Date.now();
  const signals = [
    classifyCapiOutbox(depth, now),
    classifyCapiDelivery(delivery, now),
    classifyMengantar(mengantar, now),
    classifyAutoLaris(autolaris, now),
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
