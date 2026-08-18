import { getRuntimeEnv } from "./env.ts";
import { MengantarClient } from "./mengantar-client.ts";
import {
  buildMengantarOrderPayload,
  parseMengantarDispatchResponse,
  resolveAcceptedMengantarShipment,
} from "./mengantar-order.ts";
import { getProviderConfig } from "./provider-config.ts";
import {
  canDispatchOrderToMengantar,
  MENGANTAR_DISPATCH_CLAIM_TTL_MS,
} from "./payment-dispatch-policy.ts";

export type MengantarDispatchOutcome = {
  status:
    | "dispatched"
    | "already_dispatched"
    | "in_progress"
    | "waiting_for_confirmation"
    | "waiting_for_payment"
    | "unpaid"
    | "failed";
  providerOrderId?: string;
  cnoteNo?: string;
  error?: string;
};

type DispatchOrderRow = {
  id: number;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  address: string;
  destination_area_id: string | null;
  courier_code: string | null;
  payment_method: "cod" | "bank_transfer" | "qris";
  payment_status: string;
  shipping_status: string;
  total_amount: number;
  provider_order_id: string | null;
  cnote_no: string | null;
  provider_dispatch_error: string | null;
  pickup_address_id: string | null;
};

type DispatchItemRow = {
  quantity: number;
  unit_price: number;
  unit_weight_kg: number;
  variant_title: string;
  product_title: string;
};

const DISPATCH_LEASE_MS = 20_000;
const DISPATCH_WAIT_MS = 30_000;

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function acquireMengantarLease(database: D1Database) {
  const token = crypto.randomUUID();
  const deadline = Date.now() + DISPATCH_WAIT_MS;
  let delay = 100;
  while (true) {
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + DISPATCH_LEASE_MS).toISOString();
    await database
      .prepare(
        `INSERT OR IGNORE INTO provider_dispatch_locks (
          provider, lease_token, lease_expires_at, updated_at
        ) VALUES ('mengantar', NULL, NULL, ?)`,
      )
      .bind(nowIso)
      .run();
    const claim = await database
      .prepare(
        `UPDATE provider_dispatch_locks
        SET lease_token = ?, lease_expires_at = ?, updated_at = ?
        WHERE provider = 'mengantar'
          AND (lease_token IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= ?)`,
      )
      .bind(token, expiresAt, nowIso, nowIso)
      .run();
    if (claim.meta?.changes) return token;
    if (Date.now() >= deadline) {
      throw new Error(
        "Antrean Mengantar sedang penuh. Coba ulangi pembuatan resi.",
      );
    }
    await sleep(delay);
    delay = Math.min(delay * 2, 1_000);
  }
}

async function releaseMengantarLease(database: D1Database, token: string) {
  await database
    .prepare(
      `UPDATE provider_dispatch_locks
      SET lease_token = NULL, lease_expires_at = NULL, updated_at = ?
      WHERE provider = 'mengantar' AND lease_token = ?`,
    )
    .bind(new Date().toISOString(), token)
    .run();
}

async function recordDispatchError(
  database: D1Database,
  orderId: number,
  error: string,
) {
  await database
    .prepare(
      `UPDATE orders
      SET provider_dispatch_error = ?, provider_dispatch_claimed_at = NULL,
        shipping_status = 'pending'
      WHERE id = ? AND provider_order_id IS NULL
        AND shipping_status = 'pending'`,
    )
    .bind(error.slice(0, 500), orderId)
    .run();
}

export async function dispatchOrderToMengantar(
  database: D1Database,
  locals: App.Locals,
  orderId: number,
): Promise<MengantarDispatchOutcome> {
  const order = await database
    .prepare(
      `SELECT
        o.id, o.order_number, o.customer_name, o.customer_phone, o.address,
        o.destination_area_id, o.courier_code, o.payment_method, o.payment_status,
        o.shipping_status, o.total_amount, o.provider_order_id, o.cnote_no,
        o.provider_dispatch_error, w.pickup_address_id
      FROM orders o
      LEFT JOIN warehouses w ON w.id = o.warehouse_id
      WHERE o.id = ?
      LIMIT 1`,
    )
    .bind(orderId)
    .first<DispatchOrderRow>();
  if (!order) return { status: "failed", error: "Order tidak ditemukan." };
  if (order.provider_order_id) {
    const unpaid = order.payment_method !== "cod" && !order.cnote_no;
    return {
      status: unpaid ? "unpaid" : "already_dispatched",
      providerOrderId: order.provider_order_id,
      cnoteNo: order.cnote_no || undefined,
      error: unpaid
        ? "Shipment Mengantar sudah dibuat tetapi masih menunggu nomor resi."
        : undefined,
    };
  }
  if (order.shipping_status !== "pending") {
    return {
      status: "waiting_for_confirmation",
      error: "Hanya order menunggu yang dapat dipush ke Mengantar.",
    };
  }
  if (
    !canDispatchOrderToMengantar(
      order.payment_method,
      order.payment_status,
      order.shipping_status,
    )
  ) {
    return {
      status: "waiting_for_payment",
      error: "Pembayaran online belum lunas.",
    };
  }

  const item = await database
    .prepare(
      `SELECT
        oi.quantity, oi.unit_price,
        MAX(0.001, CAST(pv.weight_grams AS REAL) / 1000) AS unit_weight_kg,
        pv.title AS variant_title, p.title AS product_title
      FROM order_items oi
      INNER JOIN product_variants pv ON pv.id = oi.variant_id
      INNER JOIN products p ON p.id = pv.product_id
      WHERE oi.order_id = ?
      ORDER BY oi.id
      LIMIT 1`,
    )
    .bind(order.id)
    .first<DispatchItemRow>();
  if (!item) {
    const error = "Item order untuk dispatch Mengantar tidak ditemukan.";
    await recordDispatchError(database, order.id, error);
    return { status: "failed", error };
  }

  const pickupAddressId = String(
    order.pickup_address_id ||
      getRuntimeEnv(locals)?.MENGANTAR_PICKUP_ADDRESS_ID ||
      "",
  ).trim();
  const destinationAreaId = order.destination_area_id?.trim() || "";
  const courierCode = order.courier_code?.trim() || "";
  const config = (await getProviderConfig(database, locals)).mengantar;
  if (
    !config.apiKey ||
    !pickupAddressId ||
    !destinationAreaId ||
    !courierCode
  ) {
    const error =
      "Kredensial Mengantar, pickup gudang, tujuan, atau kurir belum lengkap.";
    await recordDispatchError(database, order.id, error);
    return { status: "failed", error };
  }

  const claimedAt = new Date().toISOString();
  const staleBefore = new Date(
    Date.now() - MENGANTAR_DISPATCH_CLAIM_TTL_MS,
  ).toISOString();
  const claim = await database
    .prepare(
      `UPDATE orders
      SET provider_dispatch_error = 'DISPATCHING', provider_dispatch_claimed_at = ?
      WHERE id = ? AND provider_order_id IS NULL
        AND (payment_method = 'cod' OR payment_status IN ('paid', 'settled', 'success'))
        AND shipping_status = 'pending'
        AND (
          COALESCE(provider_dispatch_error, '') <> 'DISPATCHING'
          OR provider_dispatch_claimed_at IS NULL
          OR provider_dispatch_claimed_at <= ?
        )`,
    )
    .bind(claimedAt, order.id, staleBefore)
    .run();
  if (!claim.meta?.changes) {
    const current = await database
      .prepare(
        "SELECT provider_order_id, cnote_no FROM orders WHERE id = ? LIMIT 1",
      )
      .bind(order.id)
      .first<{ provider_order_id: string | null; cnote_no: string | null }>();
    return current?.provider_order_id
      ? {
          status:
            order.payment_method !== "cod" && !current.cnote_no
              ? "unpaid"
              : "already_dispatched",
          providerOrderId: current.provider_order_id,
          cnoteNo: current.cnote_no || undefined,
          error:
            order.payment_method !== "cod" && !current.cnote_no
              ? "Shipment Mengantar sudah dibuat tetapi masih menunggu nomor resi."
              : undefined,
        }
      : {
          status: "in_progress",
          error: "Order sedang diproses oleh Mengantar.",
        };
  }

  let leaseToken = "";
  try {
    leaseToken = await acquireMengantarLease(database);
    const payload = buildMengantarOrderPayload({
      orderNumber: order.order_number,
      courierCode,
      pickupAddressId,
      destinationAreaId,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      customerAddress: order.address,
      productTitle: item.product_title,
      variantTitle: item.variant_title,
      unitWeightKg: Number(item.unit_weight_kg),
      quantity: Number(item.quantity),
      paymentMethod: order.payment_method,
      goodsAmount: Number(item.unit_price) * Number(item.quantity),
      collectedAmount: Number(order.total_amount),
    });
    const response = await new MengantarClient(
      config.apiKey,
      config.baseUrl,
    ).createShipment(payload);
    const dispatched = parseMengantarDispatchResponse(response);
    const acceptedAt = new Date().toISOString();
    const accepted = resolveAcceptedMengantarShipment(
      order.payment_method,
      dispatched,
      acceptedAt,
    );
    const persistence = await database
      .prepare(
        `UPDATE orders SET
          provider_order_id = ?, provider_batch_id = ?, cnote_no = ?,
          provider_dispatch_error = ?, provider_dispatch_claimed_at = NULL,
          provider_dispatched_at = ?, shipping_status = ?,
          confirmed_at = COALESCE(confirmed_at, ?)
        WHERE id = ? AND provider_order_id IS NULL
          AND provider_dispatch_claimed_at = ?
          AND shipping_status = 'pending'
          AND (payment_method = 'cod' OR payment_status IN ('paid', 'settled', 'success'))
          AND payment_method = ? AND payment_status = ?
          AND customer_name = ? AND customer_phone = ? AND address = ?
          AND destination_area_id = ? AND courier_code = ?
          AND total_amount = ?`,
      )
      .bind(
        accepted.providerOrderId,
        accepted.providerBatchId,
        accepted.cnoteNo,
        accepted.providerDispatchError,
        accepted.providerDispatchedAt,
        accepted.shippingStatus,
        acceptedAt,
        order.id,
        claimedAt,
        order.payment_method,
        order.payment_status,
        order.customer_name,
        order.customer_phone,
        order.address,
        destinationAreaId,
        courierCode,
        order.total_amount,
      )
      .run();
    if (!persistence.meta?.changes) {
      const conflictMessage =
        "Mengantar menerima shipment, tetapi order berubah saat dispatch. Periksa shipment provider sebelum tindakan berikutnya.";
      const conflict = await database
        .prepare(
          `UPDATE orders SET
            provider_order_id = ?, provider_batch_id = ?, cnote_no = ?,
            provider_dispatch_error = ?, provider_dispatch_claimed_at = NULL,
            provider_dispatched_at = ?
          WHERE id = ? AND provider_order_id IS NULL
            AND provider_dispatch_claimed_at = ?`,
        )
        .bind(
          accepted.providerOrderId,
          accepted.providerBatchId,
          accepted.cnoteNo,
          conflictMessage,
          accepted.providerDispatchedAt,
          order.id,
          claimedAt,
        )
        .run();
      if (conflict.meta?.changes) {
        return {
          status: "failed",
          providerOrderId: accepted.providerOrderId,
          cnoteNo: accepted.cnoteNo || undefined,
          error: conflictMessage,
        };
      }

      const current = await database
        .prepare(
          `SELECT provider_order_id, cnote_no
          FROM orders
          WHERE id = ?
          LIMIT 1`,
        )
        .bind(order.id)
        .first<{ provider_order_id: string | null; cnote_no: string | null }>();
      if (current?.provider_order_id) {
        return {
          status:
            order.payment_method !== "cod" && !current.cnote_no
              ? "unpaid"
              : "already_dispatched",
          providerOrderId: current.provider_order_id,
          cnoteNo: current.cnote_no || undefined,
        };
      }
      return { status: "failed", error: conflictMessage };
    }
    return {
      status: accepted.outcome,
      providerOrderId: accepted.providerOrderId,
      cnoteNo: accepted.cnoteNo || undefined,
      error:
        accepted.outcome === "unpaid"
          ? "Saldo wallet Mengantar tidak cukup; top up diperlukan sebelum resi tersedia."
          : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordDispatchError(database, order.id, message);
    return { status: "failed", error: message };
  } finally {
    if (leaseToken) {
      try {
        await releaseMengantarLease(database, leaseToken);
      } catch (error) {
        console.error("mengantar-dispatch-lease-release", error);
      }
    }
  }
}
