import type { AdminRole } from "./auth.ts";

export type NotificationType = "order" | "lead" | "payment";

export type NotificationInput = {
  type: NotificationType;
  orderId: number;
  orderNumber: string;
  title: string;
  body: string;
};

export type NotificationRecord = {
  id: number;
  type: NotificationType;
  order_id: number;
  order_number: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export type NotificationView = NotificationRecord & {
  href: string;
  unread: boolean;
};

/**
 * `advertiser` runs ads and never touches an order, so commerce events are not
 * theirs to clear. Every other role owns some part of the order lifecycle.
 */
const COMMERCE_NOTIFICATION_ROLES: readonly AdminRole[] = [
  "owner",
  "admin",
  "customer_service",
];

export function canReceiveCommerceNotifications(role: AdminRole) {
  return COMMERCE_NOTIFICATION_ROLES.includes(role);
}

const rupiah = (value: number) =>
  `Rp ${Math.round(Number(value) || 0).toLocaleString("id-ID")}`;

const destination = (district: string, city: string) =>
  [district, city].map((part) => part.trim()).filter(Boolean).join(", ");

/**
 * Where to send the operator *now*, which is not always where the event
 * happened. A lead has no detail route of its own, so while it is still a lead
 * it points at the workspace CS works it in. But converting an ABN lead reuses
 * the same order row and renumbers it to INV, and the abandoned workspace
 * excludes converted orders — so a converted lead must link to the order
 * detail instead, or CS lands on a list it is no longer in.
 *
 * Navigation therefore reads the order's current state, while `title` and
 * `body` stay the historical record of what the event said.
 */
export function notificationHref(
  type: NotificationType,
  currentOrderNumber: string,
  isStillAbandoned: boolean,
) {
  return type === "lead" && isStillAbandoned
    ? "/admin/orders/abandoned"
    : `/admin/orders/${encodeURIComponent(currentOrderNumber)}`;
}

export function buildOrderNotification(order: {
  orderNumber: string;
  customerName: string;
  totalAmount: number;
  district: string;
  city: string;
}) {
  const place = destination(order.district, order.city);
  return {
    title: `Order baru ${order.orderNumber}`,
    body: [
      order.customerName.trim(),
      rupiah(order.totalAmount),
      place,
    ].filter(Boolean).join(" · "),
  };
}

export function buildLeadNotification(lead: {
  orderNumber: string;
  customerName: string;
  productTitle: string;
}) {
  return {
    title: `Pesanan tertinggal ${lead.orderNumber}`,
    body: [
      lead.customerName.trim() || "Tanpa nama",
      lead.productTitle.trim(),
      "Perlu follow-up",
    ].filter(Boolean).join(" · "),
  };
}

export function buildPaymentNotification(order: {
  orderNumber: string;
  customerName: string;
  totalAmount: number;
}) {
  return {
    title: `Pembayaran lunas ${order.orderNumber}`,
    body: [
      order.customerName.trim(),
      rupiah(order.totalAmount),
    ].filter(Boolean).join(" · "),
  };
}

/**
 * Records one notification, at most once per (type, order).
 *
 * Never throws and never reports failure to the caller's caller: this runs
 * beside a commerce write that has already succeeded, and a buyer must not see
 * a checkout fail because an operator convenience could not be stored
 * (REQ-149). `INSERT OR IGNORE` makes the retry and replay cases collapse into
 * the existing row rather than needing the caller to remember anything.
 */
export async function recordNotification(
  database: D1Database,
  input: NotificationInput,
): Promise<boolean> {
  try {
    const result = await database
      .prepare(
        `INSERT OR IGNORE INTO notifications
           (type, order_id, order_number, title, body, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.type,
        input.orderId,
        input.orderNumber.slice(0, 60),
        input.title.slice(0, 160),
        input.body.slice(0, 500),
        new Date().toISOString(),
      )
      .run();
    return Boolean(result.meta?.changes);
  } catch (error) {
    console.error("notification-record-failed", {
      type: input.type,
      orderId: input.orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function countUnreadNotifications(
  database: D1Database,
  operatorUsername: string,
): Promise<number> {
  const row = await database
    .prepare(
      `SELECT COUNT(*) AS unread
         FROM notifications n
         LEFT JOIN notification_reads r
           ON r.notification_id = n.id AND r.operator_username = ?
        WHERE r.notification_id IS NULL`,
    )
    .bind(operatorUsername)
    .first<{ unread: number }>();
  return Number(row?.unread || 0);
}

export async function listNotifications(
  database: D1Database,
  operatorUsername: string,
  limit = 30,
): Promise<NotificationView[]> {
  // lazy: no retention job, so this table grows one row per order forever.
  // The list is bounded by LIMIT and the unread count is an indexed COUNT, so
  // reads stay flat; add a scheduled prune beside the abandoned-order
  // retention cron if a store ever carries more rows than D1 is comfortable
  // holding.
  const bounded = Math.max(1, Math.min(100, Math.trunc(limit) || 30));
  // Joins `orders` for the CURRENT number and status, which is what the link
  // must follow — a converted lead has been renumbered and has left the
  // abandoned workspace. The stored title/body stay as recorded.
  const result = await database
    .prepare(
      `SELECT n.id, n.type, n.order_id, n.order_number, n.title, n.body,
              n.created_at, r.read_at,
              o.order_number AS current_order_number,
              o.shipping_status AS current_shipping_status
         FROM notifications n
         INNER JOIN orders o ON o.id = n.order_id
         LEFT JOIN notification_reads r
           ON r.notification_id = n.id AND r.operator_username = ?
        ORDER BY n.id DESC
        LIMIT ?`,
    )
    .bind(operatorUsername, bounded)
    .all<
      NotificationRecord & {
        current_order_number: string;
        current_shipping_status: string;
      }
    >();

  return (result.results ?? []).map(
    ({ current_order_number, current_shipping_status, ...row }) => ({
      ...row,
      href: notificationHref(
        row.type,
        current_order_number,
        current_shipping_status === "abandoned",
      ),
      unread: row.read_at === null,
    }),
  );
}

export async function markNotificationRead(
  database: D1Database,
  notificationId: number,
  operatorUsername: string,
): Promise<void> {
  await database
    .prepare(
      `INSERT OR IGNORE INTO notification_reads
         (notification_id, operator_username, read_at)
       SELECT id, ?, ? FROM notifications WHERE id = ?`,
    )
    .bind(operatorUsername, new Date().toISOString(), notificationId)
    .run();
}

export async function markAllNotificationsRead(
  database: D1Database,
  operatorUsername: string,
): Promise<void> {
  await database
    .prepare(
      `INSERT OR IGNORE INTO notification_reads
         (notification_id, operator_username, read_at)
       SELECT n.id, ?, ?
         FROM notifications n
         LEFT JOIN notification_reads r
           ON r.notification_id = n.id AND r.operator_username = ?
        WHERE r.notification_id IS NULL`,
    )
    .bind(operatorUsername, new Date().toISOString(), operatorUsername)
    .run();
}
