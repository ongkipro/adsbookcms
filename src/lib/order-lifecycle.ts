const PAYMENT_STATUSES = new Set([
  "unpaid",
  "pending",
  "paid",
  "settled",
  "success",
  "failed",
  "refunded",
  "cancelled",
]);

export const ADMIN_SHIPPING_STATUSES = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "returned",
  "cancelled",
] as const;

export type AdminShippingStatus = (typeof ADMIN_SHIPPING_STATUSES)[number];

const PAID_PAYMENT_STATUSES = new Set(["paid", "settled", "success"]);
const RELEASING_PAYMENT_STATUSES = new Set(["cancelled", "refunded", "failed"]);
const RELEASING_SHIPPING_STATUSES = new Set(["cancelled", "returned"]);
const SHIPPED_LIKE_STATUSES = new Set(["shipped", "delivered", "returned"]);
const STOCK_RELEASED_SQL =
  "(o.shipping_status IN ('cancelled', 'returned') OR o.payment_status IN ('cancelled', 'refunded', 'failed'))";

export type OrderLifecycleState = {
  id: number;
  payment_method: string;
  payment_status: string;
  shipping_status: string;
  courier_code: string | null;
  cnote_no: string | null;
  provider_order_id: string | null;
  stock_restored_at: string | null;
};

export type OrderLifecycleUpdate = {
  paymentStatus?: string;
  shippingStatus?: string;
};

export type ResolvedOrderLifecycleTransition = {
  paymentStatus: string;
  shippingStatus: string;
  releasesStock: boolean;
};

export type DeletedOrder = {
  id: number;
  order_number: string;
};

export class OrderLifecycleError extends Error {
  readonly status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "OrderLifecycleError";
    this.status = status;
  }
}

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
 * Canonical policy for manual admin lifecycle changes. Provider dispatch and
 * abandoned-order promotion own their state transitions separately because
 * they also create a shipment or reserve inventory.
 */
export function resolveAdminOrderTransition(
  current: OrderLifecycleState,
  update: OrderLifecycleUpdate,
): ResolvedOrderLifecycleTransition {
  const paymentStatus = update.paymentStatus ?? current.payment_status;
  const shippingStatus = update.shippingStatus ?? current.shipping_status;

  if (!PAYMENT_STATUSES.has(paymentStatus)) {
    throw new OrderLifecycleError("Status pembayaran tidak valid.", 400);
  }
  if (
    shippingStatus !== "abandoned" &&
    !ADMIN_SHIPPING_STATUSES.includes(shippingStatus as AdminShippingStatus)
  ) {
    throw new OrderLifecycleError("Status pengiriman tidak valid.", 400);
  }

  const paymentChanged = paymentStatus !== current.payment_status;
  const shippingChanged = shippingStatus !== current.shipping_status;
  if (!paymentChanged && !shippingChanged) {
    return {
      paymentStatus,
      shippingStatus,
      releasesStock: releasesReservedStock(paymentStatus, shippingStatus),
    };
  }

  if (
    paymentChanged &&
    PAID_PAYMENT_STATUSES.has(paymentStatus) &&
    current.payment_method !== "cod"
  ) {
    throw new OrderLifecycleError(
      "Pembayaran online hanya boleh ditandai paid oleh rekonsiliasi AutoLaris.",
    );
  }

  if (
    current.shipping_status === "abandoned" ||
    shippingStatus === "abandoned"
  ) {
    throw new OrderLifecycleError(
      "Pesanan tertinggal hanya dapat diaktifkan melalui checkout atau konversi CS agar stok dicadangkan.",
    );
  }

  const currentReleased =
    Boolean(current.stock_restored_at) ||
    releasesReservedStock(current.payment_status, current.shipping_status);
  const nextReleased = releasesReservedStock(paymentStatus, shippingStatus);
  if (
    currentReleased &&
    shippingChanged &&
    !RELEASING_SHIPPING_STATUSES.has(shippingStatus)
  ) {
    throw new OrderLifecycleError(
      "Order yang stoknya sudah dikembalikan tidak dapat diaktifkan kembali tanpa reservasi stok baru.",
    );
  }
  if (currentReleased && !nextReleased) {
    throw new OrderLifecycleError(
      "Order yang stoknya sudah dikembalikan tidak dapat diaktifkan kembali tanpa reservasi stok baru.",
    );
  }

  if (shippingStatus === "pending" && current.shipping_status !== "pending") {
    throw new OrderLifecycleError(
      "Order yang sudah masuk pengiriman tidak dapat dikembalikan ke status menunggu.",
    );
  }

  if (
    current.shipping_status === "pending" &&
    !["pending", "cancelled"].includes(shippingStatus) &&
    !current.provider_order_id
  ) {
    throw new OrderLifecycleError(
      "Gunakan aksi Push/Arrange Shipping ke Mengantar sebelum mengubah status pengiriman.",
    );
  }

  if (
    SHIPPED_LIKE_STATUSES.has(shippingStatus) &&
    (!current.provider_order_id || !current.courier_code || !current.cnote_no)
  ) {
    throw new OrderLifecycleError(
      "Order yang sudah dikirim harus memiliki shipment, kurir, dan nomor resi dari Mengantar.",
      400,
    );
  }

  if (
    shippingStatus === "delivered" &&
    current.payment_method !== "cod" &&
    !PAID_PAYMENT_STATUSES.has(paymentStatus)
  ) {
    throw new OrderLifecycleError(
      "Order non-COD tidak boleh diselesaikan sebelum berstatus paid.",
    );
  }

  return { paymentStatus, shippingStatus, releasesStock: nextReleased };
}


function selectedOrdersCte(orderIds: readonly number[]) {
  return `WITH selected(order_id) AS (VALUES ${orderIds.map(() => "(?)").join(", ")})`;
}

function buildStockRestorationStatements(
  database: D1Database,
  orderIds: readonly number[],
  requireReleasedState: boolean,
) {
  const cte = selectedOrdersCte(orderIds);
  const releaseGuard = requireReleasedState
    ? ` AND ${STOCK_RELEASED_SQL}`
    : " AND o.shipping_status <> 'abandoned'";
  return [
    database
      .prepare(
        `${cte}, reserved(variant_id, quantity) AS (
          SELECT oi.variant_id, SUM(oi.quantity)
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          JOIN selected s ON s.order_id = o.id
          WHERE o.stock_restored_at IS NULL${releaseGuard}
          GROUP BY oi.variant_id
        )
        UPDATE product_variants
        SET stock = stock + COALESCE(
          (SELECT reserved.quantity FROM reserved WHERE reserved.variant_id = product_variants.id),
          0
        )
        WHERE stock IS NOT NULL
          AND id IN (SELECT variant_id FROM reserved)`,
      )
      .bind(...orderIds),
    database
      .prepare(
        `${cte}
        UPDATE orders AS o
        SET stock_restored_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE o.id IN (SELECT order_id FROM selected)
          AND o.stock_restored_at IS NULL${releaseGuard}`,
      )
      .bind(...orderIds),
  ];
}

export async function applyOrderLifecycleMutation(
  database: D1Database,
  current: OrderLifecycleState,
  update: OrderLifecycleUpdate,
  orderMutation: D1PreparedStatement,
) {
  const transition = resolveAdminOrderTransition(current, update);
  const statements = [orderMutation];
  if (transition.releasesStock) {
    statements.push(
      ...buildStockRestorationStatements(database, [current.id], true),
    );
  }
  const results = await database.batch(statements);
  return {
    updated: Boolean(results[0]?.meta?.changes),
    stockRestored:
      transition.releasesStock && Boolean(results[2]?.meta?.changes),
  };
}

export async function updateAdminOrderShippingStatuses(
  database: D1Database,
  rawOrderIds: readonly number[],
  shippingStatus: AdminShippingStatus,
): Promise<number> {
  const orderIds = Array.from(new Set(rawOrderIds)).filter(
    (orderId) => Number.isInteger(orderId) && orderId > 0,
  );
  if (orderIds.length === 0 || orderIds.length > 100) {
    throw new OrderLifecycleError(
      "Pilih 1 sampai 100 order untuk diperbarui.",
      400,
    );
  }

  const placeholders = orderIds.map(() => "?").join(", ");
  const loaded = await database
    .prepare(
      `SELECT id, payment_method, payment_status, shipping_status,
        courier_code, cnote_no, provider_order_id, stock_restored_at
      FROM orders
      WHERE id IN (${placeholders})`,
    )
    .bind(...orderIds)
    .all<OrderLifecycleState>();
  const orders = loaded.results || [];
  if (orders.length !== orderIds.length) {
    throw new OrderLifecycleError(
      "Satu atau lebih order tidak ditemukan.",
      404,
    );
  }

  const transitions = orders.map((order) =>
    resolveAdminOrderTransition(order, { shippingStatus }),
  );
  const cte = selectedOrdersCte(orderIds);
  const statements = [
    database
      .prepare(
        `${cte}
        UPDATE orders
        SET shipping_status = '${shippingStatus}'
        WHERE id IN (SELECT order_id FROM selected)`,
      )
      .bind(...orderIds),
  ];
  if (transitions.some((transition) => transition.releasesStock)) {
    statements.push(
      ...buildStockRestorationStatements(database, orderIds, true),
    );
  }
  const results = await database.batch(statements);
  return Number(results[0]?.meta?.changes) || 0;
}

/**
 * Restores every still-reserved item and deletes all order-owned rows in one
 * D1 batch transaction. D1 rolls the whole batch back if any statement fails.
 */
export async function deleteOrdersRestoringStock(
  database: D1Database,
  rawOrderIds: readonly number[],
): Promise<DeletedOrder[]> {
  const orderIds = Array.from(new Set(rawOrderIds)).filter(
    (orderId) => Number.isInteger(orderId) && orderId > 0,
  );
  if (orderIds.length === 0 || orderIds.length > 100) {
    throw new OrderLifecycleError(
      "Pilih 1 sampai 100 order untuk dihapus.",
      400,
    );
  }

  const cte = selectedOrdersCte(orderIds);
  const statements = [
    ...buildStockRestorationStatements(database, orderIds, false),
    database
      .prepare(
        `${cte}
        DELETE FROM order_items
        WHERE order_id IN (SELECT order_id FROM selected)`,
      )
      .bind(...orderIds),
    database
      .prepare(
        `${cte}
        DELETE FROM payment_transactions
        WHERE order_id IN (SELECT order_id FROM selected)
          OR reference_id IN (
            SELECT o.order_number
            FROM orders o
            JOIN selected s ON s.order_id = o.id
          )`,
      )
      .bind(...orderIds),
    database
      .prepare(
        `${cte}
        DELETE FROM orders
        WHERE id IN (SELECT order_id FROM selected)
        RETURNING id, order_number`,
      )
      .bind(...orderIds),
  ];
  const results = await database.batch(statements);
  return (results[4]?.results || []) as DeletedOrder[];
}
