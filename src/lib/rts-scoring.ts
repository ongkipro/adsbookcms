import { MengantarClient, MengantarNotWhitelistedError } from './mengantar-client.ts';
import { getProviderConfig } from './provider-config.ts';
import { parseReceiverPerformance, type ReceiverPerformance } from './receiver-performance.ts';


export async function getReceiverPerformance(
  database: D1Database,
  customerPhone: string,
  locals?: App.Locals,
): Promise<ReceiverPerformance> {
  const cleanPhone = customerPhone.replace(/\D/g, '');
  if (cleanPhone.length < 9) throw new Error('Nomor penerima tidak valid.');

  const config = (await getProviderConfig(database, locals)).mengantar;
  if (!config.apiKey) throw new Error('Mengantar API belum dikonfigurasi.');

  const client = new MengantarClient(config.apiKey, config.baseUrl);
  const payload = await client.getReceiverPerformance(cleanPhone);
  return parseReceiverPerformance(payload, cleanPhone);
}

/**
 * Stored in `receiver_performance_json` when Mengantar refuses the lookup for
 * the account (403 Not allowed). `rts_risk_label` and `checked_at` stay null, so
 * the order keeps being retried and scores itself once access is granted.
 */
export const RECEIVER_SCORE_NOT_WHITELISTED = 'not-whitelisted';

export async function recordReceiverScoreUnavailable(
  database: D1Database,
  orderKey: string,
  at = new Date().toISOString(),
): Promise<void> {
  await database
    .prepare(
      `UPDATE orders
       SET receiver_performance_json = ?
       WHERE (order_number = ? OR CAST(id AS TEXT) = ?)
         AND receiver_performance_checked_at IS NULL`,
    )
    .bind(JSON.stringify({ unavailable: RECEIVER_SCORE_NOT_WHITELISTED, at }), orderKey, orderKey)
    .run();
}

/**
 * A refusal this recent is not retried from an admin page view: the list
 * would otherwise re-ask Mengantar for ten rows on every load and get ten
 * 403s. The hourly backfill is the retry path.
 */
export const RECEIVER_REFUSAL_RETRY_MS = 60 * 60 * 1000;

export function isRecentReceiverRefusal(refusedAt: string | null | undefined, now = Date.now()): boolean {
  const at = refusedAt ? Date.parse(refusedAt) : NaN;
  return Number.isFinite(at) && now - at < RECEIVER_REFUSAL_RETRY_MS;
}

/** Splits the stored column into a score or the reason there is none. */
export function readStoredReceiverPerformance(json: string | null): {
  receiver_performance: unknown;
  receiver_performance_unavailable: string | null;
  receiver_performance_refused_at: string | null;
} {
  let parsed: unknown = null;
  try { parsed = json ? JSON.parse(json) : null; } catch { parsed = null; }
  const unavailable = parsed && typeof parsed === 'object' && 'unavailable' in parsed
    ? String((parsed as { unavailable: unknown }).unavailable)
    : null;
  return {
    receiver_performance: unavailable ? null : parsed,
    receiver_performance_unavailable: unavailable,
    receiver_performance_refused_at: unavailable
      ? String((parsed as { at?: unknown }).at ?? '') || null
      : null,
  };
}

async function refreshOrderReceiverPerformance(
  database: D1Database,
  orderNumber: string,
  customerPhone: string,
  locals?: App.Locals,
): Promise<void> {
  let performance: ReceiverPerformance;
  try {
    performance = await getReceiverPerformance(database, customerPhone, locals);
  } catch (error) {
    if (error instanceof MengantarNotWhitelistedError) {
      await recordReceiverScoreUnavailable(database, orderNumber);
    }
    throw error;
  }

  await database
    .prepare(
      `UPDATE orders
       SET receiver_rts_score = ?,
           rts_risk_label = ?,
           receiver_performance_json = ?,
           receiver_performance_checked_at = ?
       WHERE order_number = ? OR CAST(id AS TEXT) = ?`,
    )
    .bind(
      performance.deliveryRate == null ? null : Math.round(performance.deliveryRate),
      performance.riskLevel,
      JSON.stringify(performance),
      performance.checkedAt,
      orderNumber,
      orderNumber,
    )
    .run();
}

/** Orders the hourly backfill scores per run; sequential, one provider call each. */
export const RECEIVER_SCORE_BACKFILL_LIMIT = 20;

/**
 * Hourly catch-up for orders that never got a score: a refusal before the
 * account was whitelisted, a timeout, or an order nobody opened in /admin.
 * Stops at the first refusal, so an account without access costs one call an
 * hour, not twenty; and after two failures in a row or 30 seconds, so a slow
 * Mengantar cannot hold the health check and alerts behind it for minutes.
 *
 * lazy: an order whose lookup keeps failing for another reason is retried
 * every hour until it leaves the 30-day window. Upgrade path: an attempt
 * counter column if that ever crowds out new orders.
 */
export const RECEIVER_SCORE_BACKFILL_BUDGET_MS = 30_000;

export async function backfillReceiverScores(
  database: D1Database,
  locals: App.Locals,
  limit = RECEIVER_SCORE_BACKFILL_LIMIT,
  budgetMs = RECEIVER_SCORE_BACKFILL_BUDGET_MS,
): Promise<number> {
  const deadline = Date.now() + budgetMs;
  if (!(await getProviderConfig(database, locals)).mengantar.apiKey) return 0;
  const { results } = await database
    .prepare(
      `SELECT order_number, customer_phone FROM orders
       WHERE receiver_performance_checked_at IS NULL
         AND COALESCE(shipping_status, '') NOT IN ('abandoned', 'cancelled')
         AND length(customer_phone) >= 9
         AND date(created_at) >= date('now', '-30 days')
       ORDER BY id DESC LIMIT ?`,
    )
    .bind(limit)
    .all<{ order_number: string; customer_phone: string }>();

  let scored = 0;
  let failedInARow = 0;
  for (const row of results ?? []) {
    if (Date.now() >= deadline) break;
    try {
      await refreshOrderReceiverPerformance(database, row.order_number, row.customer_phone, locals);
      scored += 1;
      failedInARow = 0;
    } catch (error) {
      if (error instanceof MengantarNotWhitelistedError) break;
      console.error('receiver-score-backfill-failed', { orderNumber: row.order_number, error });
      failedInARow += 1;
      if (failedInARow >= 2) break;
    }
  }
  return scored;
}

export function scheduleReceiverPerformanceRefresh(
  database: D1Database,
  orderNumber: string,
  customerPhone: string,
  locals?: App.Locals,
): void {
  const task = refreshOrderReceiverPerformance(database, orderNumber, customerPhone, locals)
    .catch((error) => console.error('Background receiver performance error:', error));

  if (locals?.cfContext) {
    locals.cfContext.waitUntil(task);
    return;
  }

  void task;
}
