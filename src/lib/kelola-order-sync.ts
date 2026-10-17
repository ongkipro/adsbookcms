/**
 * Every new order pushed to the Kelola CRM (Penjualan) of one toko.
 *
 * Off unless both `KELOLA_ORDER_WEBHOOK_URL` and `KELOLA_ORDER_WEBHOOK_SECRET`
 * are set — Kelola's toko settings issue the pair. The request is signed like
 * Kelola's Mengantar webhook: HMAC-SHA256 hex over `{x-timestamp}.{raw body}`.
 *
 * Kelola keys the order on `code` = our order number, so a resend is answered
 * as a duplicate rather than a second sale. That makes the delivery here
 * at-least-once on purpose: a push right after checkout (`waitUntil`), then
 * the hourly cron retries whatever Kelola has not accepted yet.
 *
 * lazy: env-only config (one Kelola toko per install). Move it to D1 + the
 * admin profile page if a store ever needs to change it without a deploy.
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

type KelolaConfig = { url: string; secret: string };

export function readKelolaConfig(env: Parameters<typeof getEnvValue>[1]): KelolaConfig | null {
  const url = getEnvValue("KELOLA_ORDER_WEBHOOK_URL", env);
  const secret = getEnvValue("KELOLA_ORDER_WEBHOOK_SECRET", env);
  return url && secret ? { url, secret } : null;
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
  const config = readKelolaConfig(getRuntimeEnv(locals));
  if (!config) return;
  const task = pushOrderToKelola(database, config, orderId);
  if (locals?.cfContext) locals.cfContext.waitUntil(task);
  else void task;
}
