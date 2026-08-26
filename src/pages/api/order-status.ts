import type { APIRoute } from "astro";
import {
  createAutoLarisPaymentForOrder,
  RETRYABLE_PAYMENT_STATUSES,
} from "../../lib/autolaris-payment.ts";
import { isAutoLarisCheckoutChannel } from "../../lib/autolaris-client.ts";
import { getRuntimeEnv } from "../../lib/env.ts";
import { loadPublicOrderStatus, resolvePublicOrderId } from "../../lib/order-status.ts";
import { checkRateLimit, getClientIp, rateLimitHeaders } from "../../lib/rate-limit.ts";

export const prerender = false;

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function json(data: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json().catch(() => null) as {
      order_pk?: unknown;
      order_id?: unknown;
      status_token?: unknown;
      retry_payment?: unknown;
    } | null;
    const orderIdentity = String(body?.order_pk ?? body?.order_id ?? "").trim();
    const statusToken = String(body?.status_token ?? "").trim();
    const retryPayment = body?.retry_payment === true;
    if (!orderIdentity || !statusToken) {
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
      return json({ success: false, error: "Database order belum tersedia." }, 503);
    }

    // The payment page polls this every minute per open tab; a retry reaches
    // the payment provider. Both are unauthenticated, so both are damped —
    // the retry far more tightly, since each one is a provider request.
    // Indonesian mobile networks put whole cities behind one CGNAT egress, so
    // the per-address ceilings are loose; the retry is additionally capped per
    // order below, which is the limit that actually protects the provider.
    const clientIp = getClientIp(request.headers);
    const rateLimit = retryPayment
      ? await checkRateLimit(database, `public-payment-retry:${clientIp}`, 30, 10 * 60_000)
      : await checkRateLimit(database, `public-order-status:${clientIp}`, 240, 60_000);
    if (!rateLimit.allowed) {
      return json(
        { success: false, error: "Terlalu banyak permintaan. Coba lagi sebentar.", code: "RATE_LIMITED" },
        429,
        rateLimitHeaders(rateLimit.remaining, rateLimit.resetAt),
      );
    }

    let orderStatus = await loadPublicOrderStatus(database, orderIdentity, statusToken);
    if (!orderStatus) {
      return json({ success: false, error: "Order tidak ditemukan." }, 404);
    }

    // A buyer holding a failed or expired instruction may ask for a new one.
    // Only that: a live or paid transaction is never touched, the channel is
    // the one the order was placed with, and the order itself must still be a
    // live, unpaid, undispatched order — a cancelled or refunded one must not
    // grow a fresh VA nobody can reconcile.
    if (
      retryPayment &&
      !orderStatus.is_paid &&
      orderStatus.status === "pending" &&
      ["pending", "unpaid"].includes(orderStatus.payment_status) &&
      orderStatus.payment &&
      !orderStatus.payment.manual_transfer &&
      RETRYABLE_PAYMENT_STATUSES.has(orderStatus.payment.status) &&
      isAutoLarisCheckoutChannel(orderStatus.payment.channel_code)
    ) {
      try {
        const orderId = await resolvePublicOrderId(database, orderIdentity, statusToken);
        if (orderId === null) throw new Error("Order pembayaran tidak ditemukan.");
        const perOrder = await checkRateLimit(database, `public-payment-retry-order:${orderId}`, 3, 10 * 60_000);
        if (!perOrder.allowed) {
          return json(
            { success: false, error: "Instruksi pembayaran baru saja dibuat ulang. Coba lagi dalam beberapa menit.", code: "RATE_LIMITED" },
            429,
            rateLimitHeaders(perOrder.remaining, perOrder.resetAt),
          );
        }
        await createAutoLarisPaymentForOrder(database, locals, {
          orderId,
          channelCode: orderStatus.payment.channel_code,
        });
      } catch (error) {
        console.error("public-payment-retry-failed", error);
      }
      orderStatus = (await loadPublicOrderStatus(database, orderIdentity, statusToken)) ?? orderStatus;
    }
    return json({ success: true, ...orderStatus });
  } catch (error) {
    console.error("public-order-status-failed", error);
    return json({ success: false, error: "Failed to fetch order status" }, 500);
  }
};
