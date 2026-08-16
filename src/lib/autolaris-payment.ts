import {
  AutoLarisClient,
  type AutoLarisCheckoutChannel,
  type AutoLarisPayment,
} from "./autolaris-client";
import {
  calculateAutoLarisRequestAmount,
  calculatePaymentAdminFee,
  normalizePaymentFeeBearer,
  type PaymentFeeBearer,
} from "./payment-fee-policy";
import { getProviderConfig } from "./provider-config";

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
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  total_amount: number;
  payment_method: string;
  payment_fee_bearer: string | null;
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
    callbackUrl: string;
  },
): Promise<AutoLarisPaymentRecord> {
  const existing = await loadPaymentRecord(database, input.orderId);
  if (existing) return existing;

  const order = await database
    .prepare(
      `SELECT o.id, o.order_number, o.customer_name, o.customer_phone,
        o.customer_email, o.total_amount, o.payment_method,
        s.payment_fee_bearer
      FROM orders o
      INNER JOIN stores s ON s.id = o.store_id
      WHERE o.id = ?
      LIMIT 1`,
    )
    .bind(input.orderId)
    .first<PaymentOrderRow>();
  if (!order) throw new Error("Order pembayaran tidak ditemukan.");
  if (order.payment_method === "cod") {
    throw new Error("Order COD tidak memerlukan AutoLaris.");
  }
  const cleanPhone = order.customer_phone?.replace(/\D/g, "") || "081234567890";
  const customerEmail =
    order.customer_email?.trim() ||
    `${cleanPhone}@${new URL(input.callbackUrl).hostname}`;


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
    ).createPayment({
      reffId: order.order_number,
      channelCode: input.channelCode,
      customerId: String(order.id),
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      customerEmail: customerEmail,
      amount: requestAmount,
      callbackUrl: input.callbackUrl,
      expiresAt,
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

