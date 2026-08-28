const GOOGLE_ADS_API_VERSION = "v25";
const PAID_STATUSES = ["paid", "settled", "success"] as const;
const MAX_RECONCILE_BATCH = 50;
const MAX_DRAIN_BATCH = 10;

export type GoogleAdsOfflineConfig = {
  customerId: string;
  conversionActionId: string;
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  loginCustomerId?: string;
  startAt: string;
};

export type GoogleClickConversion = {
  conversionAction: string;
  conversionDateTime: string;
  conversionValue: number;
  currencyCode: "IDR";
  orderId: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
};

type EligibleOrder = {
  id: number;
  order_number: string;
  payment_method: string;
  payment_status: string;
  shipping_status: string;
  created_at: string;
  ad_click_ids: string | null;
  product_value: number;
};

type OutboxRow = {
  id: number;
  payload: string;
  attempts: number;
  max_attempts: number;
};

export type GoogleRetryDecision = {
  status: "sent" | "pending" | "failed";
  delayMs: number;
};

function digits(value: string | undefined): string {
  return String(value || "").replace(/\D/g, "");
}

export function readGoogleAdsOfflineConfig(
  env: SharedEnvVars,
): GoogleAdsOfflineConfig | null {
  const customerId = digits(env.GOOGLE_ADS_CUSTOMER_ID);
  const conversionActionId = digits(env.GOOGLE_ADS_OFFLINE_CONVERSION_ACTION_ID);
  const loginCustomerId = digits(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) || undefined;
  const startAt = String(env.GOOGLE_ADS_OFFLINE_START_AT || "").trim();
  const required = {
    developerToken: String(env.GOOGLE_ADS_DEVELOPER_TOKEN || "").trim(),
    clientId: String(env.GOOGLE_ADS_CLIENT_ID || "").trim(),
    clientSecret: String(env.GOOGLE_ADS_CLIENT_SECRET || "").trim(),
    refreshToken: String(env.GOOGLE_ADS_REFRESH_TOKEN || "").trim(),
  };
  if (
    !/^\d{5,20}$/.test(customerId) ||
    !/^\d{1,20}$/.test(conversionActionId) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(startAt) ||
    Object.values(required).some((value) => !value)
  ) {
    return null;
  }
  return {
    customerId,
    conversionActionId,
    loginCustomerId,
    startAt,
    ...required,
  };
}

function readClickIds(raw: string | null): {
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
} {
  try {
    const parsed = JSON.parse(raw || "{}") as Record<string, unknown>;
    const valid = (key: "gclid" | "gbraid" | "wbraid") => {
      const value = parsed[key];
      return typeof value === "string" && /^[A-Za-z0-9._-]{1,256}$/.test(value)
        ? value
        : undefined;
    };
    return { gclid: valid("gclid"), gbraid: valid("gbraid"), wbraid: valid("wbraid") };
  } catch {
    return {};
  }
}

function googleDateTime(date: Date): string {
  return `${date.toISOString().slice(0, 19).replace("T", " ")}+00:00`;
}

export function buildGoogleClickConversion(
  order: EligibleOrder,
  config: Pick<GoogleAdsOfflineConfig, "customerId" | "conversionActionId">,
  observedAt: Date,
): { conversion: GoogleClickConversion; qualification: "online_paid" | "cod_delivered" } | null {
  const qualification = order.payment_method === "cod"
    ? order.shipping_status === "delivered" ? "cod_delivered" : null
    : PAID_STATUSES.includes(order.payment_status as (typeof PAID_STATUSES)[number])
      ? "online_paid"
      : null;
  if (!qualification || !order.order_number || !(order.product_value > 0)) return null;

  const clickIds = readClickIds(order.ad_click_ids);
  const clickIdentity = clickIds.gclid
    ? { gclid: clickIds.gclid }
    : clickIds.gbraid
      ? { gbraid: clickIds.gbraid }
      : clickIds.wbraid
        ? { wbraid: clickIds.wbraid }
        : null;
  if (!clickIdentity) return null;

  return {
    qualification,
    conversion: {
      conversionAction: `customers/${config.customerId}/conversionActions/${config.conversionActionId}`,
      conversionDateTime: googleDateTime(observedAt),
      conversionValue: order.product_value,
      currencyCode: "IDR",
      orderId: order.order_number,
      ...clickIdentity,
    },
  };
}

export function decideGoogleRetry(
  success: boolean,
  statusCode: number | undefined,
  attempts: number,
  maxAttempts: number,
): GoogleRetryDecision {
  if (success) return { status: "sent", delayMs: 0 };
  const nextAttempt = attempts + 1;
  if (
    nextAttempt >= maxAttempts ||
    (statusCode !== undefined && statusCode >= 400 && statusCode < 500 && statusCode !== 429)
  ) {
    return { status: "failed", delayMs: 0 };
  }
  const delayMs = statusCode === 429
    ? 15 * 60_000
    : Math.min(2 ** nextAttempt, 60) * 60_000;
  return { status: "pending", delayMs };
}

async function accessToken(config: GoogleAdsOfflineConfig): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = await response.json().catch(() => null) as { access_token?: unknown; error_description?: unknown } | null;
  if (!response.ok || typeof body?.access_token !== "string") {
    throw new Error(typeof body?.error_description === "string" ? body.error_description : `Google OAuth HTTP ${response.status}`);
  }
  return body.access_token;
}

export async function uploadGoogleClickConversion(
  conversion: GoogleClickConversion,
  config: GoogleAdsOfflineConfig,
  providedAccessToken?: string,
): Promise<{ success: boolean; statusCode?: number; reason?: string }> {
  try {
    const token = providedAccessToken || await accessToken(config);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "developer-token": config.developerToken,
    };
    if (config.loginCustomerId) headers["login-customer-id"] = config.loginCustomerId;
    const response = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${config.customerId}:uploadClickConversions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ conversions: [conversion], partialFailure: true }),
      },
    );
    const body = await response.json().catch(() => null) as {
      partialFailureError?: { message?: unknown };
      error?: { message?: unknown };
    } | null;
    const reason = typeof body?.partialFailureError?.message === "string"
      ? body.partialFailureError.message
      : typeof body?.error?.message === "string"
        ? body.error.message
        : undefined;
    return {
      success: response.ok && !body?.partialFailureError,
      statusCode: response.status,
      reason: response.ok && !body?.partialFailureError ? undefined : reason || `Google Ads HTTP ${response.status}`,
    };
  } catch (error) {
    return { success: false, reason: error instanceof Error ? error.message : "Google Ads network error" };
  }
}

/**
 * A candidate must carry a Google click identifier.
 *
 * This is not an optimisation. The scan is `ORDER BY o.id LIMIT n` over orders
 * that have no outbox row yet, and an order this query returns but
 * `buildGoogleClickConversion` refuses writes nothing — so it is still
 * unqueued on the next pass, and still first in line. Fifty organic delivered
 * COD orders, which is a normal week for a COD store, therefore fill the
 * window permanently and no Google-clicked order behind them is ever uploaded
 * again.
 *
 * TRACKING_SPECS §10 already states the rule — "Only orders with a stored
 * `gclid`, `gbraid`, or `wbraid` are queued" — it just lived in the builder
 * alone. Applying it here makes the candidate set and the builder agree, which
 * is what stops the head of the queue from blocking it.
 *
 * `ad_click_ids` is written by `serializeClickIds`, i.e. `JSON.stringify` of
 * validated `[A-Za-z0-9._-]` values: no spaces, and no value can contain a
 * quoted key, so this text match cannot be tripped by a click id's contents.
 */
const CLICK_IDENTITY_PREDICATE = `(
  o.ad_click_ids LIKE '%"gclid":"%'
  OR o.ad_click_ids LIKE '%"gbraid":"%'
  OR o.ad_click_ids LIKE '%"wbraid":"%'
)`;

export async function reconcileGoogleAdsConversions(
  database: D1Database,
  config: GoogleAdsOfflineConfig,
  observedAt = new Date(),
): Promise<number> {
  const paid = PAID_STATUSES.map(() => "?").join(", ");
  const result = await database.prepare(
    `SELECT o.id, o.order_number, o.payment_method, o.payment_status,
       o.shipping_status, o.created_at, o.ad_click_ids,
       COALESCE((SELECT SUM(oi.unit_price * oi.quantity) FROM order_items oi WHERE oi.order_id = o.id), 0) AS product_value
     FROM orders o
     LEFT JOIN google_ads_conversion_outbox g ON g.order_id = o.id
     WHERE g.order_id IS NULL
       AND o.created_at >= ?
       AND ${CLICK_IDENTITY_PREDICATE}
       AND ((o.payment_method = 'cod' AND o.shipping_status = 'delivered')
         OR (o.payment_method <> 'cod' AND o.payment_status IN (${paid})))
     ORDER BY o.id
     LIMIT ?`,
  ).bind(config.startAt, ...PAID_STATUSES, MAX_RECONCILE_BATCH).all<EligibleOrder>();

  let queued = 0;
  const now = observedAt.toISOString();
  for (const order of result.results || []) {
    const built = buildGoogleClickConversion(order, config, observedAt);
    if (!built) continue;
    const inserted = await database.prepare(
      `INSERT OR IGNORE INTO google_ads_conversion_outbox
       (order_id, order_number, qualification, payload, status, next_retry_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
    ).bind(
      order.id,
      order.order_number,
      built.qualification,
      JSON.stringify(built.conversion),
      now,
      now,
      now,
    ).run();
    if (inserted.meta?.changes) queued += 1;
  }
  return queued;
}

export async function drainGoogleAdsConversionOutbox(
  database: D1Database,
  config: GoogleAdsOfflineConfig,
): Promise<number> {
  const rows = await database.prepare(
    `SELECT id, payload, attempts, max_attempts
     FROM google_ads_conversion_outbox
     WHERE status = 'pending' AND next_retry_at <= ?
     ORDER BY id LIMIT ?`,
  ).bind(new Date().toISOString(), MAX_DRAIN_BATCH).all<OutboxRow>();
  if (!rows.results?.length) return 0;
  let sent = 0;
  let token: string;
  try {
    token = await accessToken(config);
  } catch {
    // One credential outage affects the whole batch. Leave rows pending rather
    // than spending every conversion's retry budget on the same shared failure.
    return 0;
  }
  for (const row of rows.results || []) {
    let conversion: GoogleClickConversion;
    try {
      conversion = JSON.parse(row.payload) as GoogleClickConversion;
    } catch {
      await database.prepare(
        `UPDATE google_ads_conversion_outbox SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?`,
      ).bind("payload tidak dapat dibaca", new Date().toISOString(), row.id).run();
      continue;
    }
    const outcome = await uploadGoogleClickConversion(conversion, config, token);
    const decision = decideGoogleRetry(outcome.success, outcome.statusCode, row.attempts, row.max_attempts);
    const now = Date.now();
    await database.prepare(
      `UPDATE google_ads_conversion_outbox
       SET status = ?, attempts = attempts + ?, last_error = ?, next_retry_at = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(
      decision.status,
      decision.status === "sent" ? 0 : 1,
      decision.status === "sent" ? null : outcome.reason || "unknown",
      new Date(now + decision.delayMs).toISOString(),
      new Date(now).toISOString(),
      row.id,
    ).run();
    if (decision.status === "sent") sent += 1;
  }
  return sent;
}
