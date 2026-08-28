/**
 * Server-side Meta Purchase for an order that became paid after the buyer had
 * left (A-166).
 *
 * The browser Purchase fires from `/thanks`, and a buyer whose VA is confirmed
 * by an operator hours later never revisits it. This enqueues the same event
 * from the order row alone — `event_id` is the order number on both legs, and
 * the outbox's unique index on it means a Purchase already sent by `/thanks`
 * (or already queued) is a no-op here. It is deliberately best-effort: a
 * failure to enqueue must never undo a payment confirmation.
 */
import { catalogProductId } from "./catalog-feed.ts";
import { deliverCapiEvent, drainCapiOutbox, enqueueCapiEvent } from "./capi-outbox.ts";
import { getStoreAdsConfig } from "./store-ads.ts";
import { toE164Digits } from "./meta-capi.ts";
import { matchableCustomerEmail } from "./autolaris-payment.ts";

type PaidOrderRow = {
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  province: string;
  city: string;
  postal_code: string | null;
  payment_status: string;
  product_value: number;
};

type OrderProductRow = { product_id: number; title: string };

export type PaidOrderPurchaseResult =
  | { status: "queued"; delivered: boolean }
  | { status: "deduplicated" }
  | { status: "skipped"; reason: string };

export async function enqueuePurchaseForPaidOrder(
  database: D1Database,
  locals: App.Locals,
  orderId: number,
): Promise<PaidOrderPurchaseResult> {
  const ads = await getStoreAdsConfig(locals);
  if (!ads.metaPixelId || !ads.metaCapiToken) {
    return { status: "skipped", reason: "meta-not-configured" };
  }
  const order = await database
    .prepare(
      `SELECT o.order_number, o.customer_name, o.customer_phone, o.customer_email,
              o.province, o.city, o.postal_code, o.payment_status,
              (SELECT COALESCE(SUM(oi.unit_price * oi.quantity), 0)
                 FROM order_items oi WHERE oi.order_id = o.id) AS product_value
         FROM orders o
        WHERE o.id = ?
        LIMIT 1`,
    )
    .bind(orderId)
    .first<PaidOrderRow>();
  if (!order) return { status: "skipped", reason: "order-not-found" };
  if (!["paid", "settled", "success"].includes(String(order.payment_status).toLowerCase())) {
    return { status: "skipped", reason: "order-not-paid" };
  }
  const products = await database
    .prepare(
      `SELECT DISTINCT p.id AS product_id, p.title
         FROM order_items oi
         INNER JOIN product_variants pv ON pv.id = oi.variant_id
         INNER JOIN products p ON p.id = pv.product_id
        WHERE oi.order_id = ?`,
    )
    .bind(orderId)
    .all<OrderProductRow>();
  const rows = products.results ?? [];
  const contentIds: string[] = [];
  for (const row of rows) {
    try {
      contentIds.push(catalogProductId(row.product_id));
    } catch {
      // A product whose id cannot form a catalogue id simply carries no content_id.
    }
  }

  const siteUrl = locals.tenant?.siteUrl || "https://example.com";
  const queued = await enqueueCapiEvent(database, {
    eventName: "Purchase",
    eventId: order.order_number,
    eventSourceUrl: new URL("/thanks", siteUrl).toString(),
    userData: {
      phone: order.customer_phone,
      name: order.customer_name,
      // See `/api/meta-event`: a minted provider address is not a match key.
      email: matchableCustomerEmail(order.customer_email, siteUrl),
      city: order.city,
      province: order.province,
      postalCode: order.postal_code || undefined,
      externalId: toE164Digits(order.customer_phone),
    },
    customData: {
      contentName: rows[0]?.title,
      contentIds: contentIds.length ? contentIds : undefined,
      value: Number(order.product_value ?? 0),
      currency: "IDR",
      orderNumber: order.order_number,
    },
  });
  if (!queued) return { status: "deduplicated" };

  const delivered = await deliverCapiEvent(
    database,
    order.order_number,
    ads.metaPixelId,
    ads.metaCapiToken,
  );
  const drain = drainCapiOutbox(database, ads.metaPixelId, ads.metaCapiToken).catch((error) =>
    console.error("capi-outbox-drain", error),
  );
  if (locals.cfContext) locals.cfContext.waitUntil(drain);
  else void drain;
  return { status: "queued", delivered };
}
