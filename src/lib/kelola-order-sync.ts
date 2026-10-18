/**
 * Every new order pushed to the Kelola CRM (Penjualan) of one toko.
 *
 * Off until a URL + secret pair is configured — Kelola's toko settings issue
 * it. The pair saved at /admin/profile (`stores.kelola_webhook_*`) wins over the
 * `KELOLA_ORDER_WEBHOOK_URL` / `_SECRET` env fallback. The request is signed like
 * Kelola's Mengantar webhook: HMAC-SHA256 hex over `{x-timestamp}.{raw body}`.
 *
 * Kelola keys the order on `code` = our order number, so a resend is answered
 * as a duplicate rather than a second sale. That makes the delivery here
 * at-least-once on purpose: a push right after checkout (`waitUntil`), then
 * the hourly cron retries whatever Kelola has not accepted yet, and an operator
 * can resend one order from its detail page.
 */
import { getEnvValue, getRuntimeEnv } from "./env.ts";

/** Orders older than this are left alone — also stops a first enable from
 *  replaying the store's whole history into Kelola. */
export const KELOLA_RETRY_WINDOW_HOURS = 24;
const PUSH_TIMEOUT_MS = 10_000;
const DRAIN_BATCH = 50;

type OrderRow = {
  id: number;
  order_number: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  address: string;
  province: string;
  city: string;
  district: string;
  postal_code: string | null;
  shipping_cost: number;
  discount_amount: number | null;
  total_amount: number;
  payment_method: string;
};
type ItemRow = { sku: string; name: string; quantity: number; unit_price: number; weight_grams: number };

type KelolaConfig = { url: string; secret: string; source?: "dashboard" | "server" };

export function readKelolaConfig(env: Parameters<typeof getEnvValue>[1]): KelolaConfig | null {
  const url = getEnvValue("KELOLA_ORDER_WEBHOOK_URL", env);
  const secret = getEnvValue("KELOLA_ORDER_WEBHOOK_SECRET", env);
  return url && secret ? { url, secret, source: "server" } : null;
}

/** Dashboard pair first, env pair as the fallback; null = the push is off. */
export async function getKelolaConfig(
  database: D1Database,
  env: Parameters<typeof getEnvValue>[1],
): Promise<KelolaConfig | null> {
  const row = await database
    .prepare("SELECT kelola_webhook_url, kelola_webhook_secret FROM stores ORDER BY id LIMIT 1")
    .first<{ kelola_webhook_url: string | null; kelola_webhook_secret: string | null }>()
    // A Worker serving before migration 0064 lands still has its env pair.
    .catch(() => null);
  const url = row?.kelola_webhook_url?.trim();
  const secret = row?.kelola_webhook_secret?.trim();
  return url && secret ? { url, secret, source: "dashboard" } : readKelolaConfig(env);
}

/**
 * A pasted webhook URL, or null when it cannot be one Kelola issued. HTTPS
 * only: the body carries buyer names, phones and addresses.
 */
export function normalizeKelolaWebhookUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" && /^\/api\/public\/toko\/order\/[^/]+$/.test(url.pathname) && !url.search
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/** The URL with its token hidden — the token alone routes to the toko. */
export function maskKelolaWebhookUrl(url: string) {
  const token = url.split("/").pop() ?? "";
  return `${url.slice(0, url.length - token.length)}${token.slice(0, 4)}…${token.slice(-4)}`;
}

/**
 * Prove URL + secret without creating an order: a correctly signed empty body
 * passes Kelola's token and signature checks and stops at validation (400).
 */
export async function testKelolaConnection(
  config: KelolaConfig,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: boolean; message: string }> {
  const body = "{}";
  const timestamp = String(Date.now());
  try {
    const response = await fetcher(config.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-timestamp": timestamp,
        "x-signature": await signKelolaBody(config.secret, timestamp, body),
      },
      body,
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
    });
    if (response.status === 400) return { ok: true, message: "Terhubung: URL dan secret diterima Kelola." };
    if (response.status === 404) return { ok: false, message: "Kelola tidak mengenal URL ini. Sambungkan ulang toko di Kelola lalu tempel URL barunya." };
    if (response.status === 401) return { ok: false, message: "Secret tidak cocok dengan URL ini, atau jam server berselisih lebih dari 5 menit." };
    return { ok: false, message: `Kelola membalas HTTP ${response.status}.` };
  } catch (error) {
    return { ok: false, message: `Kelola tidak terjangkau: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** What /admin/profile shows: is the push keeping up, and what broke last. */
export async function kelolaSyncStatus(database: D1Database, now = new Date()) {
  const since = new Date(now.getTime() - KELOLA_RETRY_WINDOW_HOURS * 3_600_000).toISOString();
  const counts = await database
    .prepare(
      `SELECT MAX(kelola_synced_at) AS last_synced_at,
              SUM(CASE WHEN kelola_synced_at IS NOT NULL AND created_at >= ?1 THEN 1 ELSE 0 END) AS synced_24h,
              SUM(CASE WHEN kelola_synced_at IS NULL AND kelola_attempts > 0 AND created_at >= ?1 THEN 1 ELSE 0 END) AS failing_24h
       FROM orders
       WHERE shipping_status != 'abandoned' AND stock_restored_at IS NULL`,
    )
    .bind(since)
    .first<{ last_synced_at: string | null; synced_24h: number | null; failing_24h: number | null }>();
  const lastError = await database
    .prepare(
      `SELECT order_number, kelola_attempts AS attempts, kelola_last_error AS message
       FROM orders
       WHERE kelola_synced_at IS NULL AND kelola_last_error IS NOT NULL
         AND shipping_status != 'abandoned' AND stock_restored_at IS NULL AND created_at >= ?
       ORDER BY id DESC LIMIT 1`,
    )
    .bind(since)
    .first<{ order_number: string; attempts: number; message: string }>();
  return {
    last_synced_at: counts?.last_synced_at ?? null,
    synced_24h: Number(counts?.synced_24h ?? 0),
    failing_24h: Number(counts?.failing_24h ?? 0),
    last_error: lastError ?? null,
  };
}

/** The body Kelola's `/api/public/toko/order/:token` validates. */
export function kelolaOrderPayload(order: OrderRow, items: ItemRow[]) {
  const cod = order.payment_method === "cod";
  return {
    code: order.order_number,
    // created_at is UTC ISO; Kelola's order date is the WIB calendar day.
    date: new Date(Date.parse(order.created_at) + 7 * 3_600_000).toISOString().slice(0, 10),
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    address: order.address,
    kecamatan: order.district || undefined,
    kota: order.city || undefined,
    provinsi: order.province || undefined,
    kodePos: order.postal_code || undefined,
    payment: cod ? "cod" : "transfer",
    ongkir: order.shipping_cost,
    discount: order.discount_amount ?? 0,
    // What the courier collects, COD fee included when the buyer bears it.
    codValue: cod ? order.total_amount : null,
    berat: items.reduce((sum, item) => sum + item.weight_grams * item.quantity, 0),
    items: items.map((item) => ({
      sku: item.sku,
      name: item.name,
      qty: item.quantity,
      price: item.unit_price,
    })),
  };
}

export async function signKelolaBody(secret: string, timestamp: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Push one order; returns true once Kelola holds it (created or duplicate).
 * Never throws — the outcome is recorded on the order row for the next try.
 */
export async function pushOrderToKelola(
  database: D1Database,
  config: KelolaConfig,
  orderId: number,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const order = await database
      .prepare(
        `SELECT id, order_number, created_at, customer_name, customer_phone, address,
                province, city, district, postal_code, shipping_cost, discount_amount,
                total_amount, payment_method
         FROM orders
         WHERE id = ? AND kelola_synced_at IS NULL
           AND shipping_status != 'abandoned' AND stock_restored_at IS NULL`,
      )
      .bind(orderId)
      .first<OrderRow>();
    if (!order) return false;
    const { results: items } = await database
      .prepare(
        `SELECT pv.sku, p.title || CASE WHEN pv.title = p.title THEN '' ELSE ' - ' || pv.title END AS name,
                oi.quantity, oi.unit_price, pv.weight_grams
         FROM order_items oi
         JOIN product_variants pv ON pv.id = oi.variant_id
         JOIN products p ON p.id = pv.product_id
         WHERE oi.order_id = ?
         ORDER BY oi.id`,
      )
      .bind(orderId)
      .all<ItemRow>();
    if (!items.length) return false;

    const body = JSON.stringify(kelolaOrderPayload(order, items));
    const timestamp = String(Date.now());
    const response = await fetcher(config.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-timestamp": timestamp,
        "x-signature": await signKelolaBody(config.secret, timestamp, body),
      },
      body,
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
    });
    if (response.ok) {
      await database
        .prepare("UPDATE orders SET kelola_synced_at = ?, kelola_last_error = NULL WHERE id = ?")
        .bind(new Date().toISOString(), orderId)
        .run();
      return true;
    }
    await recordFailure(database, orderId, `HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  } catch (error) {
    await recordFailure(database, orderId, error instanceof Error ? error.message : String(error)).catch(() => {});
  }
  return false;
}

function recordFailure(database: D1Database, orderId: number, message: string) {
  console.error("kelola-order-push-failed", { orderId, message });
  return database
    .prepare("UPDATE orders SET kelola_attempts = kelola_attempts + 1, kelola_last_error = ? WHERE id = ?")
    .bind(message, orderId)
    .run();
}

/** One order's push as its detail page shows it. */
export async function kelolaOrderState(database: D1Database, env: Parameters<typeof getEnvValue>[1], orderId: number) {
  const row = await database
    .prepare("SELECT kelola_synced_at, kelola_attempts, kelola_last_error, stock_restored_at FROM orders WHERE id = ?")
    .bind(orderId)
    .first<{ kelola_synced_at: string | null; kelola_attempts: number; kelola_last_error: string | null; stock_restored_at: string | null }>();
  return {
    configured: Boolean(await getKelolaConfig(database, env)),
    synced_at: row?.kelola_synced_at ?? null,
    attempts: Number(row?.kelola_attempts ?? 0),
    last_error: row?.kelola_last_error ?? null,
    voided: Boolean(row?.stock_restored_at),
  };
}

/**
 * The detail page's "send again". Not bound by the cron's 24h window — an
 * operator asked for this order. An order Kelola already holds is not re-sent.
 */
export async function resendOrderToKelola(database: D1Database, env: Parameters<typeof getEnvValue>[1], orderId: number) {
  const config = await getKelolaConfig(database, env);
  const before = await kelolaOrderState(database, env, orderId);
  if (!config) return { ok: false, error: "Kelola CRM belum dihubungkan di Profil & Integrasi.", state: before };
  if (before.voided) return { ok: false, error: "Order yang dibatalkan tidak dikirim ke Kelola.", state: before };
  if (before.synced_at) return { ok: true, state: before };
  await pushOrderToKelola(database, config, orderId);
  const state = await kelolaOrderState(database, env, orderId);
  return state.synced_at
    ? { ok: true, state }
    : { ok: false, error: `Kelola belum menerima order ini: ${state.last_error ?? "order tanpa item"}`, state };
}

/** Cron leg: retry every order Kelola has not accepted inside the window. */
export async function drainKelolaOrders(
  database: D1Database,
  config: KelolaConfig,
  now = new Date(),
  fetcher: typeof fetch = fetch,
): Promise<number> {
  const since = new Date(now.getTime() - KELOLA_RETRY_WINDOW_HOURS * 3_600_000).toISOString();
  const { results } = await database
    .prepare(
      `SELECT id FROM orders
       WHERE kelola_synced_at IS NULL AND shipping_status != 'abandoned'
         AND stock_restored_at IS NULL AND created_at >= ?
       ORDER BY id LIMIT ?`,
    )
    .bind(since, DRAIN_BATCH)
    .all<{ id: number }>();
  let synced = 0;
  for (const { id } of results) {
    if (await pushOrderToKelola(database, config, id, fetcher)) synced += 1;
  }
  return synced;
}

/** Checkout leg: push right after the order is stored, without delaying the buyer. */
export function scheduleKelolaOrderPush(database: D1Database, orderId: number, locals?: App.Locals) {
  const task = getKelolaConfig(database, getRuntimeEnv(locals))
    .then((config) => (config ? pushOrderToKelola(database, config, orderId) : false))
    .catch((error) => console.error("kelola-order-push-failed", { orderId, error }));
  if (locals?.cfContext) locals.cfContext.waitUntil(task);
  else void task;
}
