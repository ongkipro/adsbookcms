/**
 * Stock is reserved at order creation (`persistOrder` decrements
 * `product_variants.stock`). Without a release path, every cancelled or
 * returned order permanently burns inventory — which matters most in a COD
 * funnel, where return-to-sender is a normal outcome, not an exception.
 */

/** Order states that mean the goods are back on the shelf. */
const RELEASING_SHIPPING_STATUSES = new Set(["cancelled", "returned"]);
const RELEASING_PAYMENT_STATUSES = new Set(["cancelled", "refunded", "failed"]);

export function releasesReservedStock(
  paymentStatus: string,
  shippingStatus: string,
) {
  return (
    RELEASING_SHIPPING_STATUSES.has(shippingStatus) ||
    RELEASING_PAYMENT_STATUSES.has(paymentStatus)
  );
}

/**
 * Returns an order's reserved units to stock exactly once. The restore and the
 * `stock_restored_at` stamp run in one D1 batch, both guarded on the stamp
 * still being NULL, so repeated cancellations cannot inflate inventory.
 */
export async function restoreReservedStock(
  database: D1Database,
  orderId: number,
): Promise<boolean> {
  const restoredAt = new Date().toISOString();
  const results = await database.batch([
    database
      .prepare(
        `UPDATE product_variants
         SET stock = stock + COALESCE(
           (SELECT SUM(oi.quantity) FROM order_items oi
             WHERE oi.variant_id = product_variants.id AND oi.order_id = ?1), 0)
         WHERE stock IS NOT NULL
           AND id IN (SELECT variant_id FROM order_items WHERE order_id = ?1)
           AND EXISTS (
             SELECT 1 FROM orders WHERE id = ?1 AND stock_restored_at IS NULL
           )`,
      )
      .bind(orderId),
    database
      .prepare(
        `UPDATE orders SET stock_restored_at = ?
         WHERE id = ? AND stock_restored_at IS NULL`,
      )
      .bind(restoredAt, orderId),
  ]);
  return Boolean(results[1]?.meta?.changes);
}
