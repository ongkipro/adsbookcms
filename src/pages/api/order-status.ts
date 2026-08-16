import type { APIRoute } from "astro";
import { getRuntimeEnv } from "../../lib/env.ts";

export const prerender = false;

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json().catch(() => null) as {
      order_pk?: unknown;
      order_id?: unknown;
      status_token?: unknown;
    } | null;
    const orderPk = String(body?.order_pk ?? body?.order_id ?? "").trim();
    const statusToken = String(body?.status_token ?? "").trim();
    if (!orderPk || !statusToken) {
      return json(
        {
          success: false,
          error: "Parameter order_pk/order_id dan status_token wajib diisi.",
        },
        400,
      );
    }

    const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
    if (!database?.prepare) {
      return json(
        { success: false, error: "Database order belum tersedia." },
        503,
      );
    }
    const orderRow = (await database
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
      .bind(orderPk, orderPk, statusToken)
      .first()) as {
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
    } | null;
    if (!orderRow)
      return json({ success: false, error: "Order tidak ditemukan." }, 404);
    const paymentStatus = (orderRow.payment_status || "unpaid").toLowerCase();
    return json({
      success: true,
      is_paid: ["paid", "settled", "success"].includes(paymentStatus),
      order_number: orderRow.order_number || orderPk,
      payment_method: orderRow.payment_method || "",
      payment_status: paymentStatus,
      status: orderRow.shipping_status || "pending",
      // The order's own total, exposed at the top level so a COD order — where
      // `payment` is null — still has a server-authoritative revenue figure.
      // Conversion value must come from here, not from browser state.
      total_amount: Number(orderRow.total_amount ?? 0),
      payment:
        orderRow.channel_code || orderRow.payment_method === "manual_transfer" || orderRow.payment_method !== "cod"
          ? {
              channel_code:
                orderRow.channel_code || orderRow.seller_bank_code || "",
              fee_bearer:
                orderRow.fee_bearer === "seller" ? "seller" : "buyer",
              status: orderRow.transaction_status || paymentStatus,
              amount: Number(orderRow.amount ?? orderRow.total_amount ?? 0),
              admin_fee: Number(orderRow.admin_fee ?? 0),
              total_amount: Number(
                orderRow.payment_total ?? orderRow.total_amount ?? 0,
              ),
              virtual_account:
                orderRow.virtual_account ||
                orderRow.seller_account_number ||
                null,
              account_holder: orderRow.seller_account_holder || null,
              bank_name:
                orderRow.seller_bank_name || orderRow.seller_bank_code || null,
              manual_transfer: orderRow.payment_method === "manual_transfer",
              qr_payload: orderRow.qr_payload || null,
              payment_code: orderRow.payment_code || null,
              payment_url: orderRow.provider_payment_url || null,
              expires_at: orderRow.expires_at || null,
              error: orderRow.failed_reason || null,
            }
          : null,
    });
  } catch {
    return json({ success: false, error: "Failed to fetch order status" }, 500);
  }
};
