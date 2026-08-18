export type PublicPaymentStatus = {
  channel_code: string;
  fee_bearer: "buyer" | "seller";
  status: string;
  amount: number;
  admin_fee: number;
  total_amount: number;
  virtual_account: string | null;
  account_holder: string | null;
  bank_name: string | null;
  manual_transfer: boolean;
  qr_payload: string | null;
  payment_code: string | null;
  payment_url: string | null;
  expires_at: string | null;
  error: string | null;
};

export type PublicOrderStatus = {
  is_paid: boolean;
  order_number: string;
  payment_method: string;
  payment_status: string;
  status: string;
  total_amount: number;
  payment: PublicPaymentStatus | null;
};

type PublicOrderStatusRow = {
  order_number?: string;
  total_amount?: number;
  payment_method?: string;
  payment_status?: string;
  shipping_status?: string;
  seller_bank_code?: string | null;
  seller_bank_name?: string | null;
  seller_account_holder?: string | null;
  seller_account_number?: string | null;
  channel_code?: string | null;
  fee_bearer?: string | null;
  transaction_status?: string | null;
  amount?: number | null;
  admin_fee?: number | null;
  payment_total?: number | null;
  virtual_account?: string | null;
  qr_payload?: string | null;
  payment_code?: string | null;
  provider_payment_url?: string | null;
  expires_at?: string | null;
  failed_reason?: string | null;
};

export async function loadPublicOrderStatus(
  database: D1Database,
  orderIdentity: string,
  statusToken: string,
): Promise<PublicOrderStatus | null> {
  const orderRow = await database
    .prepare(
      `
      SELECT
        o.order_number,
        o.total_amount,
        o.payment_method,
        o.payment_status,
        o.shipping_status,
        o.seller_bank_code,
        o.seller_bank_name,
        o.seller_account_holder,
        o.seller_account_number,
        pt.channel_code,
        pt.fee_bearer,
        pt.status AS transaction_status,
        pt.amount,
        pt.admin_fee,
        pt.total_amount AS payment_total,
        pt.virtual_account,
        pt.qr_payload,
        pt.payment_code,
        pt.provider_payment_url,
        pt.expires_at,
        pt.failed_reason
      FROM orders o
      LEFT JOIN payment_transactions pt
        ON pt.id = (
          SELECT latest.id
          FROM payment_transactions latest
          WHERE latest.order_id = o.id
          ORDER BY latest.id DESC
          LIMIT 1
        )
      WHERE (CAST(o.id AS TEXT) = ? OR o.order_number = ?)
        AND o.public_status_token = ?
      LIMIT 1
    `,
    )
    .bind(orderIdentity, orderIdentity, statusToken)
    .first<PublicOrderStatusRow>();
  if (!orderRow) return null;

  const paymentStatus = (orderRow.payment_status || "unpaid").toLowerCase();
  return {
    is_paid: ["paid", "settled", "success"].includes(paymentStatus),
    order_number: orderRow.order_number || orderIdentity,
    payment_method: orderRow.payment_method || "",
    payment_status: paymentStatus,
    status: orderRow.shipping_status || "pending",
    total_amount: Number(orderRow.total_amount ?? 0),
    payment:
      orderRow.channel_code ||
      orderRow.payment_method === "manual_transfer" ||
      orderRow.payment_method !== "cod"
        ? {
            channel_code: orderRow.channel_code || orderRow.seller_bank_code || "",
            fee_bearer: orderRow.fee_bearer === "seller" ? "seller" : "buyer",
            status: orderRow.transaction_status || paymentStatus,
            amount: Number(orderRow.amount ?? orderRow.total_amount ?? 0),
            admin_fee: Number(orderRow.admin_fee ?? 0),
            total_amount: Number(orderRow.payment_total ?? orderRow.total_amount ?? 0),
            virtual_account: orderRow.virtual_account || orderRow.seller_account_number || null,
            account_holder: orderRow.seller_account_holder || null,
            bank_name: orderRow.seller_bank_name || orderRow.seller_bank_code || null,
            manual_transfer: orderRow.payment_method === "manual_transfer",
            qr_payload: orderRow.qr_payload || null,
            payment_code: orderRow.payment_code || null,
            payment_url: orderRow.provider_payment_url || null,
            expires_at: orderRow.expires_at || null,
            error: orderRow.failed_reason || null,
          }
        : null,
  };
}
