export type PaymentStatusBucket = {
  status: string;
  transaction_count: number;
  billed_total: number;
  admin_fees: number;
};

export type RecordedBalanceSummary = {
  paidFunds: number;
  pendingBilled: number;
  recordedFees: number;
  failedCount: number;
};

export type RecordedPaymentRow = {
  id: number;
  order_id: number;
  order_number: string;
  customer_name: string;
  provider_transaction_id: string | null;
  channel_code: string;
  status: string;
  amount: number;
  admin_fee: number;
  total_amount: number;
  expires_at: string | null;
  paid_at: string | null;
  failed_reason: string | null;
  created_at: string;
};

const PAID_STATUSES: Record<string, true> = {
  paid: true,
  settled: true,
  success: true,
};
const PENDING_STATUSES: Record<string, true> = {
  pending: true,
  unpaid: true,
};

export function summarizePaymentBuckets(
  buckets: PaymentStatusBucket[],
): RecordedBalanceSummary {
  const summary: RecordedBalanceSummary = {
    paidFunds: 0,
    pendingBilled: 0,
    recordedFees: 0,
    failedCount: 0,
  };
  for (const bucket of buckets) {
    const status = bucket.status.toLowerCase();
    const billedTotal = Number(bucket.billed_total || 0);
    const fees = Number(bucket.admin_fees || 0);
    const count = Number(bucket.transaction_count || 0);
    if (PAID_STATUSES[status]) summary.paidFunds += billedTotal;
    if (PENDING_STATUSES[status]) summary.pendingBilled += billedTotal;
    if (status === "failed") summary.failedCount += count;
    summary.recordedFees += fees;
  }
  return summary;
}

export async function loadRecordedAutoLarisBalance(database: D1Database) {
  const [bucketResult, transactionResult] = await database.batch([
    database.prepare(
      `SELECT status, COUNT(*) AS transaction_count,
        COALESCE(SUM(total_amount), 0) AS billed_total,
        COALESCE(SUM(admin_fee), 0) AS admin_fees
      FROM payment_transactions
      WHERE provider = 'autolaris'
      GROUP BY status`,
    ),
    database.prepare(
      `SELECT pt.id, pt.order_id, o.order_number, o.customer_name,
        pt.provider_transaction_id, pt.channel_code, pt.status, pt.amount,
        pt.admin_fee, pt.total_amount, pt.expires_at, pt.paid_at,
        pt.failed_reason, pt.created_at
      FROM payment_transactions pt
      INNER JOIN orders o ON o.id = pt.order_id
      WHERE pt.provider = 'autolaris'
      ORDER BY pt.id DESC
      LIMIT 100`,
    ),
  ]);
  if (!bucketResult.success || !transactionResult.success) {
    throw new Error("D1 menolak query rekonsiliasi AutoLaris.");
  }

  const buckets = (bucketResult.results || []) as PaymentStatusBucket[];
  return {
    summary: summarizePaymentBuckets(buckets),
    transactions: (transactionResult.results || []) as RecordedPaymentRow[],
  };
}
