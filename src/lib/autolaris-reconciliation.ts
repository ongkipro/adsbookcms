type ReconciliationRow = {
  transaction_id: number;
  order_id: number;
  order_number: string;
  payment_method: string;
  provider_transaction_id: string | null;
  reference_id: string;
  status: string;
};
export class AutoLarisPaymentNotFoundError extends Error {}

export async function reconcileAutoLarisPaidPayment(
  database: D1Database,
  _locals: App.Locals,
  input: {
    providerTransactionId?: string;
    referenceId?: string;
  },
) {
  const providerTransactionId = input.providerTransactionId?.trim() || "";
  const referenceId = input.referenceId?.trim() || "";
  if (!providerTransactionId && !referenceId) {
    throw new AutoLarisPaymentNotFoundError(
      "Identitas transaksi AutoLaris tidak tersedia.",
    );
  }

  const row = await database
    .prepare(
      `SELECT
        pt.id AS transaction_id, pt.order_id, o.order_number, o.payment_method,
        pt.provider_transaction_id, pt.reference_id, pt.status
      FROM payment_transactions pt
      INNER JOIN orders o ON o.id = pt.order_id
      WHERE (pt.provider_transaction_id = ? OR pt.reference_id = ?)
        AND o.payment_method IN ('bank_transfer', 'qris')
      LIMIT 1`,
    )
    .bind(providerTransactionId, referenceId)
    .first<ReconciliationRow>();
  if (
    !row ||
    (providerTransactionId &&
      row.provider_transaction_id !== providerTransactionId) ||
    (referenceId && row.reference_id !== referenceId)
  ) {
    throw new AutoLarisPaymentNotFoundError(
      "Transaksi AutoLaris tidak ditemukan.",
    );
  }


  const paidAt = new Date().toISOString();
  const [paymentResult, orderResult] = await database.batch([
    database
      .prepare(
        `UPDATE payment_transactions
        SET status = 'paid', paid_at = COALESCE(paid_at, ?), failed_reason = NULL,
          updated_at = ?
        WHERE id = ? AND status <> 'paid'`,
      )
      .bind(paidAt, paidAt, row.transaction_id),
    database
      .prepare(
        `UPDATE orders
        SET payment_status = 'paid'
        WHERE id = ? AND payment_method IN ('bank_transfer', 'qris')`,
      )
      .bind(row.order_id),
  ]);
  if (!paymentResult.success || !orderResult.success) {
    throw new Error("D1 menolak rekonsiliasi pembayaran AutoLaris.");
  }

  return {
    orderId: row.order_id,
    orderNumber: row.order_number,
    transitioned: Number(paymentResult.meta?.changes || 0) > 0,
    shippingQueued: false,
  };
}
