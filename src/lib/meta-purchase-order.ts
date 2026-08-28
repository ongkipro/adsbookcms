/**
 * The one server-authoritative read behind every Meta Purchase.
 *
 * Both Purchase surfaces need the same three facts from D1 — the canonical
 * `order_number` that becomes the `event_id` on both legs, the customer
 * identity to match on, and `product_value`, the goods rather than the invoice.
 * They differ only in how the caller earned the right to ask.
 *
 * The read is exported as two named functions rather than one with an optional
 * token, deliberately. An optional token is a footgun: a later caller on a
 * public route that forgets to pass it silently gets an unauthenticated lookup,
 * and the name would not warn anybody. These names cannot be confused.
 */

export type MetaPurchaseOrder = {
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  province: string;
  city: string;
  postal_code: string | null;
  total_amount: number;
  /**
   * Variant price x quantity, summed from `order_items`. Excludes shipping,
   * the COD service fee and its VAT, and the payment channel's admin fee —
   * optimising on those would have the platform bidding on the courier's price
   * list as if it were margin.
   */
  product_value: number;
  payment_method: string;
  payment_status: string;
};

const PURCHASE_ORDER_SELECT = `
  SELECT
    o.order_number, o.customer_name, o.customer_phone, o.customer_email,
    o.province, o.city, o.postal_code, o.total_amount,
    o.payment_method, o.payment_status,
    (
      SELECT COALESCE(SUM(oi.unit_price * oi.quantity), 0)
      FROM order_items oi
      WHERE oi.order_id = o.id
    ) AS product_value
  FROM orders o
  WHERE (CAST(o.id AS TEXT) = ? OR o.order_number = ?)
`;

/**
 * For the first-party storefront route, which is reachable by anyone.
 *
 * The per-order `public_status_token` is what stops a stranger who guesses an
 * order number from minting a Purchase against it.
 */
export function findPurchaseOrderByStatusToken(
  database: D1Database,
  locator: string,
  statusToken: string,
): Promise<MetaPurchaseOrder | null> {
  return database
    .prepare(`${PURCHASE_ORDER_SELECT} AND o.public_status_token = ? LIMIT 1`)
    .bind(locator, locator, statusToken)
    .first<MetaPurchaseOrder>();
}

/**
 * For the headless route, where a developer API key with `tracking:write` has
 * already authenticated the caller and no browser holds a status token.
 *
 * The lookup still has to happen. Without it the route took the caller's word
 * for both the event id and the revenue, which is the one thing the rest of
 * this system refuses to do — an order that cannot be resolved emits no
 * Purchase at all rather than a mismatched one.
 */
export function findPurchaseOrderForApiKeyCaller(
  database: D1Database,
  locator: string,
): Promise<MetaPurchaseOrder | null> {
  return database
    .prepare(`${PURCHASE_ORDER_SELECT} LIMIT 1`)
    .bind(locator, locator)
    .first<MetaPurchaseOrder>();
}
