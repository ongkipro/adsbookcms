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

/** Statuses a buyer may ask to have regenerated; anything else is live or final. */
export const RETRYABLE_PAYMENT_STATUSES: ReadonlySet<string> = new Set(["failed", "expired"]);

/**
 * Expiry is decided at read time. Nothing ever wrote `status = 'expired'`
 * — the provider closes a VA or QR on its own clock and never tells us — so
 * a pending row past `expires_at` was rendered as a live instruction, the
 * countdown reached 00:00:00, and the page kept polling it forever. Deriving
 * the state here makes every reader agree without a sweeper.
 */
export function effectivePaymentStatus(
  status: string,
  expiresAt: string | null | undefined,
  now = Date.now(),
): string {
  if (status !== "pending" || !expiresAt) return status;
  const expiry = new Date(expiresAt).getTime();
  return Number.isFinite(expiry) && expiry <= now ? "expired" : status;
}

/**
 * AutoLaris rejects any `reff_id` that is not digits, so the store's own
 * `INV-10001` cannot be sent verbatim. The numeric part is the store-wide
 * order sequence, which is already unique and never reused, and it keeps the
 * provider reference readable against the order number during reconciliation.
 */
export function autoLarisReferenceId(orderNumber: string) {
  const digits = orderNumber.replace(/\D/g, "");
  if (!digits) {
    throw new Error("Nomor order tidak dapat dijadikan referensi AutoLaris.");
  }
  return digits.slice(0, 30);
}

/**
 * A buyer email is mandatory at the provider. COD checkouts do not collect one,
 * so an order converted to an online payment later still needs a deliverable-
 * looking address that belongs to this store rather than to a stranger.
 */
export function buyerEmail(
  storedEmail: string | null,
  customerPhone: string,
  siteUrl: string,
) {
  const stored = storedEmail?.trim();
  if (stored) return stored;
  return `${customerPhone.replace(/\D/g, "")}@${new URL(siteUrl).hostname}`;
}

function mapPaymentRecord(row: PaymentTransactionRow): AutoLarisPaymentRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    orderNumber: row.order_number,
    publicToken: row.public_token,
    channelCode: row.channel_code,
    feeBearer: normalizePaymentFeeBearer(row.fee_bearer),
    status: effectivePaymentStatus(row.status, row.expires_at) as AutoLarisPaymentRecord["status"],
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

export async function loadPaymentRecord(database: D1Database, orderId: number) {
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
  // One order holds one transaction row (unique index). A live or final row
  // is returned as is; a failed or expired one is reused for a fresh provider
  // request rather than left as a dead end — before this, one provider hiccup
  // at checkout left the buyer with no instructions and no way to get any.
  const existing = await loadPaymentRecord(database, input.orderId);
  if (existing && !RETRYABLE_PAYMENT_STATUSES.has(existing.status)) return existing;

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
  if (!["bank_transfer", "qris"].includes(order.payment_method)) {
    throw new Error("Metode pembayaran order tidak menggunakan AutoLaris.");
  }
  const siteUrl = locals.tenant?.siteUrl || "https://example.com";
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

  if (existing) {
    await database
      .prepare(
        `UPDATE payment_transactions SET
          channel_code = ?, fee_bearer = ?, status = 'pending', amount = ?,
          admin_fee = ?, total_amount = ?, provider_transaction_id = NULL,
          virtual_account = NULL, qr_payload = NULL, payment_code = NULL,
          provider_payment_url = NULL, failed_reason = NULL, expires_at = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .bind(
        input.channelCode,
        feeBearer,
        requestAmount,
        expectedAdminFee,
        expectedBilledTotal,
        expiresAt.toISOString(),
        createdAt,
        existing.id,
      )
      .run();
  } else {
    try {
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
    } catch (error) {
      // Two submits raced on the same order: the unique index kept one row.
      // Hand back that row instead of failing the order over the loser.
      const raced = await loadPaymentRecord(database, order.id);
      if (raced) return raced;
      throw error;
    }
  }

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
      reffId: autoLarisReferenceId(order.order_number),
      channelCode: input.channelCode,
      customerId: String(order.id),
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      customerEmail: buyerEmail(order.customer_email, order.customer_phone, siteUrl),
      expiresAt,
      amount: requestAmount,
      callbackUrl: new URL("/api/webhooks/autolaris", siteUrl).toString(),
    });

    if (payment.total !== expectedBilledTotal) {
      // The provider's figure is what the buyer will actually be charged, so
      // it is stored as is — but it is no longer the total shown at checkout,
      // and the fee table in `payment-fee-policy.ts` is what needs updating.
      console.error("autolaris-fee-mismatch", {
        orderNumber: order.order_number,
        channelCode: input.channelCode,
        expected: expectedBilledTotal,
        provider: payment.total,
      });
    }

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
