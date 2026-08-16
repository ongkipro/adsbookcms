import type { APIRoute } from "astro";
import { hasClickId, readClickIdCookie, serializeClickIds } from "../../lib/click-ids";
import { normalizePhoneNumber } from "../../lib/order-schema";
import { getRuntimeEnv } from "../../lib/env";
import { loadStoreCodDisabledProvinceCodes } from "../../lib/form-mode";
import { resolveGeoLocation } from "../../lib/geo";
import { isProvinceExcluded } from "../../lib/province";
import { detectExcludedAreaInText } from "../../lib/excluded-area";
import {
  checkRateLimit,
  getClientIp,
  rateLimitHeaders,
} from "../../lib/rate-limit";
import { scheduleReceiverPerformanceRefresh } from "../../lib/rts-scoring";
import {
  DuplicateSubmissionError,
  OrderInputError,
  persistOrder,
} from "../../lib/order-persistence";

export const prerender = false;

const json = (
  body: Record<string, unknown>,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });

export const POST: APIRoute = async ({ request, locals }) => {
  const clientIp = getClientIp(request.headers);
  const sessions = getRuntimeEnv(locals)?.SESSION as KVNamespace | undefined;
  const rateLimit = await checkRateLimit(
    sessions,
    `submit-middle-order:${clientIp}`,
    10,
    60_000,
  );
  if (!rateLimit.allowed) {
    return json(
      {
        success: false,
        error: "Terlalu banyak percobaan. Coba lagi sebentar.",
        code: "RATE_LIMITED",
      },
      429,
      rateLimitHeaders(rateLimit.remaining, rateLimit.resetAt),
    );
  }
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body)
    return json(
      {
        success: false,
        error: "Payload tidak valid.",
        code: "VALIDATION_ERROR",
      },
      400,
    );
  if (String(body.website || "").trim()) {
    return json(
      {
        success: false,
        error: "Request tidak valid",
        code: "HONEYPOT_TRIGGERED",
      },
      400,
    );
  }

  const submitToken = String(body.submit_token || "").trim();
  const customerName = String(body.customer_name || "").trim();
  const customerPhone = normalizePhoneNumber(String(body.customer_phone || ""));
  const address = String(body.address || "").trim();
  const variantKey = String(
    body.variant_id || body.variant_unique_id || "",
  ).trim();
  const quantity = Number(body.quantity || 1);
  if (submitToken.length < 16 || submitToken.length > 120)
    return json(
      {
        success: false,
        error: "Token submit tidak valid",
        code: "VALIDATION_ERROR",
      },
      422,
    );
  if (customerName.length < 2 || customerName.length > 100)
    return json(
      {
        success: false,
        error: "Nama harus berisi 2-100 karakter",
        code: "VALIDATION_ERROR",
      },
      422,
    );
  if (!/^(08|628)\d{8,11}$/.test(customerPhone))
    return json(
      {
        success: false,
        error: "Nomor HP harus berisi 10-13 digit (contoh: 081234567890)",
        code: "VALIDATION_ERROR",
      },
      422,
    );
  if (address.length < 10 || address.length > 500)
    return json(
      {
        success: false,
        error: "Alamat lengkap harus berisi 10-500 karakter",
        code: "VALIDATION_ERROR",
      },
      422,
    );
  if (!variantKey || variantKey.length > 120)
    return json(
      {
        success: false,
        error: "Varian produk harus dipilih",
        code: "VALIDATION_ERROR",
      },
      422,
    );
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100)
    return json(
      {
        success: false,
        error: "Jumlah produk tidak valid",
        code: "VALIDATION_ERROR",
      },
      422,
    );

  const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
  if (!database?.prepare)
    return json(
      {
        success: false,
        error: "Database order belum tersedia.",
        code: "DATABASE_UNAVAILABLE",
      },
      503,
    );
  const [geo, disabledProvinceCodes] = await Promise.all([
    resolveGeoLocation(request),
    loadStoreCodDisabledProvinceCodes(database),
  ]);
  const detectedExcludedArea = detectExcludedAreaInText(
    address,
    disabledProvinceCodes,
  );
  if (
    (geo.provinceCode &&
      isProvinceExcluded(geo.provinceCode, disabledProvinceCodes)) ||
    detectedExcludedArea
  ) {
    return json(
      {
        success: false,
        error:
          "COD tidak tersedia untuk wilayah ini. Silakan gunakan form pengiriman lengkap.",
        code: "AREA_REQUIRES_FULL",
      },
      422,
    );
  }

  try {
    // Attribution captured at the ad landing by the middleware; kept with the
    // order so a COD sale confirmed later can be uploaded to Google Ads.
    const clickIds = readClickIdCookie(request);
    const storedClickIds = hasClickId(clickIds) ? serializeClickIds(clickIds) : undefined;

    const order = await persistOrder(database, {
      submitToken,
      customerName,
      customerPhone,
      address,
      province: geo.province,
      city: "",
      district: "",
      variantKey,
      quantity,
      shippingCost: 0,
      paymentMethod: "cod",
      adClickIds: storedClickIds,
    });
    scheduleReceiverPerformanceRefresh(
      database,
      order.orderNumber,
      customerPhone,
      locals,
    );
    const data = {
      id: order.id,
      order_id: order.orderNumber,
      order_pk: order.id,
      order_number: order.orderNumber,
      status_token: order.publicStatusToken,
      payment_method: "cod",
      payment_status: "unpaid",
      status: "pending",
      customer_name: customerName,
      customer_phone: customerPhone,
      address,
      product_name: String(body.product_name || ""),
      variant_id: variantKey,
      variant_unique_id: variantKey,
      quantity,
      shipping_cost: 0,
      cod_service_fee: order.codServiceFee,
      cod_service_fee_vat: order.codServiceFeeVat,
      cod_fee_bearer: order.codFeeBearer,
      total_payment: order.totalAmount,
    };
    return json({
      success: true,
      data: { order: data, ...data },
      order: data,
      ...data,
    });
  } catch (error) {
    if (error instanceof DuplicateSubmissionError)
      return json(
        { success: false, error: error.message, code: "DUPLICATE_SUBMIT" },
        409,
      );
    if (error instanceof OrderInputError)
      return json(
        { success: false, error: error.message, code: "VALIDATION_ERROR" },
        422,
      );
    console.error("submit-middle-order", error);
    return json(
      {
        success: false,
        error: "Gagal menyimpan pesanan.",
        code: "ORDER_PERSIST_FAILED",
      },
      500,
    );
  }
};
