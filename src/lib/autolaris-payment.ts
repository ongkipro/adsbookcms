import {
  AutoLarisClient,
  type AutoLarisCheckoutChannel,
  type AutoLarisPayment,
} from "./autolaris-client.ts";
import {
  calculateAutoLarisRequestAmount,
  calculatePaymentAdminFee,
  normalizePaymentFeeBearer,
  type PaymentFeeBearer,
} from "./payment-fee-policy.ts";
import { getProviderConfig } from "./provider-config.ts";

export type AutoLarisPaymentRecord = {
  id: number;
  orderId: number;
  orderNumber: string;
  publicToken: string;
  channelCode: AutoLarisCheckoutChannel;
  feeBearer: PaymentFeeBearer;
  status: "pending" | "paid" | "failed" | "expired" | "refunded";
  amount: number;
  adminFee: number;
  totalAmount: number;
  virtualAccount?: string;
  qrPayload?: string;
  paymentCode?: string;
  providerPaymentUrl?: string;
  expiresAt?: string;
  failedReason?: string;
};

type PaymentOrderRow = {
  id: number;
  order_number: string;
  store_id: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  address: string;
  province: string;
  city: string;
  district: string;
  postal_code: string | null;
  destination_area_id: string | null;
  total_amount: number;
  payment_method: string;
  payment_fee_bearer: string | null;
  store_name: string;
  warehouse_name: string | null;
  origin_area_id: string | null;
  warehouse_contact_name: string | null;
  warehouse_contact_phone: string | null;
  warehouse_address: string | null;
  warehouse_city: string | null;
  warehouse_province: string | null;
};

type PaymentOrderItemRow = {
  quantity: number;
  unit_price: number;
  weight_grams: number;
  product_title: string;
  variant_title: string;
};

type PaymentTransactionRow = {
  id: number;
  order_id: number;
  order_number: string;
  public_token: string;
  channel_code: AutoLarisCheckoutChannel;
  fee_bearer: string;
  status: AutoLarisPaymentRecord["status"];
  amount: number;
  admin_fee: number;
  total_amount: number;
  virtual_account: string | null;
  qr_payload: string | null;
  payment_code: string | null;
  provider_payment_url: string | null;
  expires_at: string | null;
  failed_reason: string | null;
};

const cleanOptional = (value: string | null) => value?.trim() || undefined;

function mapPaymentRecord(row: PaymentTransactionRow): AutoLarisPaymentRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    orderNumber: row.order_number,
    publicToken: row.public_token,
    channelCode: row.channel_code,
    feeBearer: normalizePaymentFeeBearer(row.fee_bearer),
    status: row.status,
    amount: Number(row.amount),
    adminFee: Number(row.admin_fee),
    totalAmount: Number(row.total_amount),
    virtualAccount: cleanOptional(row.virtual_account),
    qrPayload: cleanOptional(row.qr_payload),
    paymentCode: cleanOptional(row.payment_code),
    providerPaymentUrl: cleanOptional(row.provider_payment_url),
    expiresAt: cleanOptional(row.expires_at),
    failedReason: cleanOptional(row.failed_reason),
  };
}

async function loadPaymentRecord(database: D1Database, orderId: number) {
  const row = await database
    .prepare(
      `SELECT
        pt.id, pt.order_id, o.order_number, pt.public_token, pt.channel_code,
        pt.fee_bearer, pt.status, pt.amount, pt.admin_fee, pt.total_amount,
        pt.virtual_account, pt.qr_payload, pt.payment_code,
        pt.provider_payment_url, pt.expires_at, pt.failed_reason
      FROM payment_transactions pt
      INNER JOIN orders o ON o.id = pt.order_id
      WHERE pt.order_id = ?
      ORDER BY pt.id DESC
      LIMIT 1`,
    )
    .bind(orderId)
    .first<PaymentTransactionRow>();
  return row ? mapPaymentRecord(row) : undefined;
}

export async function createAutoLarisPaymentForOrder(
  database: D1Database,
  locals: App.Locals,
  input: {
    orderId: number;
    channelCode: AutoLarisCheckoutChannel;
  },
): Promise<AutoLarisPaymentRecord> {
  const existing = await loadPaymentRecord(database, input.orderId);
  if (existing) return existing;

  const order = await database
    .prepare(
      `SELECT o.id, o.order_number, o.store_id, o.customer_name,
        o.customer_phone, o.customer_email, o.address, o.province, o.city,
        o.district, o.postal_code, o.destination_area_id, o.total_amount,
        o.payment_method, s.payment_fee_bearer, s.name AS store_name,
        w.name AS warehouse_name, w.origin_area_id,
        w.contact_name AS warehouse_contact_name,
        w.contact_phone AS warehouse_contact_phone,
        w.address AS warehouse_address, w.city AS warehouse_city,
        w.province AS warehouse_province
      FROM orders o
      INNER JOIN stores s ON s.id = o.store_id
      LEFT JOIN warehouses w ON w.id = o.warehouse_id
        AND w.store_id = o.store_id
      WHERE o.id = ?
      LIMIT 1`,
    )
    .bind(input.orderId)
    .first<PaymentOrderRow>();
  if (!order) throw new Error("Order pembayaran tidak ditemukan.");
  if (!["bank_transfer", "qris"].includes(order.payment_method)) {
    throw new Error("Metode pembayaran order tidak menggunakan AutoLaris.");
  }
  const itemsResult = await database
    .prepare(
      `SELECT oi.quantity, oi.unit_price, pv.weight_grams,
        p.title AS product_title, pv.title AS variant_title
      FROM order_items oi
      INNER JOIN product_variants pv ON pv.id = oi.variant_id
      INNER JOIN products p ON p.id = pv.product_id
      WHERE oi.order_id = ? AND p.store_id = ?
      ORDER BY oi.id`,
    )
    .bind(order.id, order.store_id)
    .all<PaymentOrderItemRow>();
  const items = itemsResult.results || [];


  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const createdAt = now.toISOString();
  const publicToken = crypto.randomUUID();
  const feeBearer = normalizePaymentFeeBearer(order.payment_fee_bearer);
  const requestAmount = calculateAutoLarisRequestAmount(
    input.channelCode,
    order.total_amount,
    feeBearer,
  );
  const expectedAdminFee = calculatePaymentAdminFee(
    input.channelCode,
    requestAmount,
  );
  const expectedBilledTotal = requestAmount + expectedAdminFee;

  await database
    .prepare(
      `INSERT INTO payment_transactions (
        order_id, provider, reference_id, public_token, channel_code, fee_bearer,
        status, amount, admin_fee, total_amount, expires_at, created_at,
        updated_at
      ) VALUES (?, 'autolaris', ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      order.id,
      order.order_number,
      publicToken,
      input.channelCode,
      feeBearer,
      requestAmount,
      expectedAdminFee,
      expectedBilledTotal,
      expiresAt.toISOString(),
      createdAt,
      createdAt,
    )
    .run();

  const transaction = await loadPaymentRecord(database, order.id);
  if (!transaction) throw new Error("Catatan pembayaran gagal dibuat.");

  const config = (await getProviderConfig(database, locals)).autolaris;
  if (!config.apiKey) {
    await database
      .prepare(
        `UPDATE payment_transactions
        SET status = 'failed', failed_reason = ?, updated_at = ?
        WHERE id = ?`,
      )
      .bind(
        "AutoLaris belum dikonfigurasi.",
        new Date().toISOString(),
        transaction.id,
      )
      .run();
    const failed = await loadPaymentRecord(database, order.id);
    if (!failed) throw new Error("Catatan pembayaran gagal dimuat ulang.");
    return failed;
  }

  try {
    const payment: AutoLarisPayment = await new AutoLarisClient(
      config.apiKey,
      config.baseUrl,
    ).createOrder({
      reffId: order.order_number,
      channelCode: input.channelCode,
      originAreaId: order.origin_area_id || "",
      destinationAreaId: order.destination_area_id || "",
      weightGrams: items.reduce(
        (total, item) => total + Number(item.weight_grams) * Number(item.quantity),
        0,
      ),
      shipperName:
        order.warehouse_contact_name || order.warehouse_name || order.store_name,
      shipperPhone: order.warehouse_contact_phone || "",
      shipperAddress: [
        order.warehouse_address,
        order.warehouse_city,
        order.warehouse_province,
      ]
        .filter(Boolean)
        .join(", "),
      receiverName: order.customer_name,
      receiverPhone: order.customer_phone,
      receiverEmail: order.customer_email || "",
      receiverAddress: [
        order.address,
        order.district,
        order.city,
        order.province,
        order.postal_code,
      ]
        .filter(Boolean)
        .join(", "),
      orderDetails: items.map((item) => ({
        name: [item.product_title, item.variant_title]
          .filter(Boolean)
          .join(" - "),
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
      })),
      amount: requestAmount,
    });

    await database
      .prepare(
        `UPDATE payment_transactions SET
          provider_transaction_id = ?, status = 'pending', amount = ?,
          admin_fee = ?, total_amount = ?, virtual_account = ?, qr_payload = ?,
          payment_code = ?, provider_payment_url = ?, failed_reason = NULL,
          updated_at = ?
        WHERE id = ?`,
      )
      .bind(
        payment.transactionId,
        payment.amount,
        payment.admin,
        payment.total,
        payment.virtualAccount || null,
        payment.qr || null,
        payment.paymentCode || null,
        payment.url || null,
        new Date().toISOString(),
        transaction.id,
      )
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await database
      .prepare(
        `UPDATE payment_transactions
        SET status = 'failed', failed_reason = ?, updated_at = ?
        WHERE id = ?`,
      )
      .bind(message.slice(0, 500), new Date().toISOString(), transaction.id)
      .run();
  }

  const updated = await loadPaymentRecord(database, order.id);
  if (!updated) throw new Error("Catatan pembayaran gagal dimuat ulang.");
  return updated;
}
