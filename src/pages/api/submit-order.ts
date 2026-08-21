import type { CourierRateResult } from "../../lib/mengantar-client";
import { hasClickId, readClickIdCookie, serializeClickIds } from "../../lib/click-ids";
import type { ResolvedShippingRates } from "../../lib/shipping-quote";
import type { APIRoute } from "astro";
import { selectQuotedRate } from "../../lib/courier-rules";
import { orderSubmitSchema } from "../../lib/order-schema";
import {
  isCodBlockedForProvince,
  loadStoreCodDisabledProvinceCodes,
} from "../../lib/form-mode";
import { getRuntimeEnv } from "../../lib/env";
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
import {
  resolveEligibleShippingRates,
  ShippingQuoteError,
} from "../../lib/shipping-quote";
import {
  createAutoLarisPaymentForOrder,
  type AutoLarisPaymentRecord,
} from "../../lib/autolaris-payment";
import { getProviderConfig } from "../../lib/provider-config";
import { normalizePhone } from "../../lib/validation";

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
    `submit-order:${clientIp}`,
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

  const parsed = orderSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        success: false,
        error: parsed.error.errors[0]?.message || "Data tidak valid",
        code: "VALIDATION_ERROR",
      },
      422,
    );
  }
  const data = parsed.data;
  const customerPhone = normalizePhone(data.customer_phone);
  const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
  if (!database?.prepare) {
    return json(
      {
        success: false,
        error: "Database order belum tersedia.",
        code: "DATABASE_UNAVAILABLE",
      },
      503,
    );
  }
  const disabledProvinceCodes =
    await loadStoreCodDisabledProvinceCodes(database);
  if (
    isCodBlockedForProvince(
      data.payment_method,
      data.province,
      disabledProvinceCodes,
    )
  ) {
    return json(
      {
        success: false,
        error:
          "COD tidak tersedia untuk wilayah ini. Silakan pilih pembayaran online/transfer.",
        code: "COD_NOT_AVAILABLE_FOR_REGION",
      },
      422,
    );
  }
  if (data.payment_method !== "cod") {
    try {
      const provider = (await getProviderConfig(database, locals)).autolaris;
      if (!provider.apiKey) {
        return json(
          {
            success: false,
            error: "Pembayaran online belum tersedia. Silakan pilih COD.",
            code: "PAYMENT_METHOD_UNAVAILABLE",
          },
          503,
        );
      }
    } catch (error) {
      console.error("submit-order-payment-config", error);
      return json(
        {
          success: false,
          error: "Pembayaran online belum dapat diverifikasi.",
          code: "PAYMENT_PROVIDER_ERROR",
        },
        503,
      );
    }
  }

  const destinationId = String(
    body.location_id || body.destination_id || "",
  ).trim();
  const courierCode = String(body.shipment_provider_code || "").trim();
  const courierServiceId = Number(body.courier_service_id);
  const submittedShippingCost = Number(body.shipping_cost);
  if (!destinationId || destinationId.length > 120) {
    return json(
      {
        success: false,
        error: "Tujuan pengiriman tidak valid.",
        code: "VALIDATION_ERROR",
      },
      422,
    );
  }
  if (!courierCode || courierCode.length > 50) {
    return json(
      {
        success: false,
        error: "Kurir harus dipilih.",
        code: "VALIDATION_ERROR",
      },
      422,
    );
  }
  if (
    !Number.isInteger(courierServiceId) ||
    courierServiceId < 1 ||
    courierServiceId > 100
  ) {
    return json(
      {
        success: false,
        error: "Layanan kurir tidak valid.",
        code: "VALIDATION_ERROR",
      },
      422,
    );
  }
  if (!Number.isInteger(submittedShippingCost) || submittedShippingCost < 0) {
    return json(
      {
        success: false,
        error: "Biaya pengiriman tidak valid.",
        code: "VALIDATION_ERROR",
      },
      422,
    );
  }

  let quote: ResolvedShippingRates;
  let selectedRate: CourierRateResult | undefined;
  let trustedShippingCost: number;
  try {
    quote = await resolveEligibleShippingRates(database, locals, {
      destinationId,
      destinationCity: String(body.city || "").trim() || undefined,
      paymentMethod: data.payment_method,
      variantKey: data.variant_id,
      quantity: data.quantity,
    });
    selectedRate = selectQuotedRate(quote.rates, courierCode, courierServiceId);
    if (!selectedRate) {
      return json(
        {
          success: false,
          error: "Pilihan kurir sudah tidak tersedia. Muat ulang ongkir.",
          code: "SHIPPING_OPTION_INVALID",
        },
        409,
      );
    }
    // See the COD fee note in `shipping-quote.ts`. `cod_service_fee` is added
    // by `persistOrder`, so folding the provider figure in here would double it.
    trustedShippingCost = selectedRate.price;
    if (trustedShippingCost !== submittedShippingCost) {
      return json(
        {
          success: false,
          error: "Tarif ongkir berubah. Muat ulang ongkir sebelum melanjutkan.",
          code: "SHIPPING_QUOTE_CHANGED",
          shipping_cost: trustedShippingCost,
        },
        409,
      );
    }
  } catch (error) {
    const quoteError = error instanceof ShippingQuoteError ? error : null;
    if (!quoteError) console.error("submit-order-shipping-quote", error);
    return json(
      {
        success: false,
        error: quoteError?.message || "Tarif ongkir belum dapat diverifikasi.",
        code: quoteError?.code || "SHIPPING_PROVIDER_ERROR",
      },
      quoteError?.status || 502,
    );
  }
  try {
    // Attribution captured at the ad landing by the middleware; kept with the
    // order so a COD sale confirmed later can be uploaded to Google Ads.
    const clickIds = readClickIdCookie(request);
    const storedClickIds = hasClickId(clickIds) ? serializeClickIds(clickIds) : undefined;

    const order = await persistOrder(database, {
      submitToken: data.submit_token,
      customerName: data.customer_name.trim(),
      customerPhone,
      customerEmail:
        data.customer_email ||
        (data.payment_method !== "cod"
          ? `${customerPhone}@${new URL(request.url).hostname}`
          : undefined),
      address: data.address,
      province: data.province,
      city: String(body.city || "")
        .trim()
        .slice(0, 120),
      district: data.district,
      postalCode: data.postal_code || undefined,
      variantKey: data.variant_id,
      quantity: data.quantity,
      shippingCost: trustedShippingCost,
      paymentMethod: data.payment_method,
      sellerBankAccountId: data.seller_bank_account_id,
      warehouseId: quote.warehouse?.id,
      destinationAreaId: destinationId,
      courierCode: selectedRate.courier_code,
      courierService: selectedRate.courier_service,
      adClickIds: storedClickIds,
    });

    let payment: AutoLarisPaymentRecord | undefined;
    if (
      data.payment_method !== "cod" &&
      data.payment_method !== "manual_transfer"
    ) {
      try {
        payment = await createAutoLarisPaymentForOrder(database, locals, {
          orderId: order.id,
          channelCode: data.payment_channel!,
        });
        if (payment.status === "failed") {
          await database
            .prepare("UPDATE orders SET payment_status = 'failed' WHERE id = ?")
            .bind(order.id)
            .run();
        }
      } catch (error) {
        console.error("submit-order-autolaris-error", error);
        await database
          .prepare("UPDATE orders SET payment_status = 'failed' WHERE id = ?")
          .bind(order.id)
          .run();
      }
    }
    scheduleReceiverPerformanceRefresh(
      database,
      order.orderNumber,
      customerPhone,
      locals,
    );
    const paymentStatus =
      data.payment_method === "cod" ? "unpaid" : payment?.status || "pending";
    const paymentUrl = payment?.providerPaymentUrl || "";
    return json({
      success: true,
      order: {
        id: order.id,
        order_id: order.orderNumber,
        order_number: order.orderNumber,
        status_token: order.publicStatusToken,
        payment_method: data.payment_method,
        payment_status: paymentStatus,
        status: "pending",
        total_payment: payment?.totalAmount || order.totalAmount,
        shipping_cost: trustedShippingCost,
        cod_service_fee: order.codServiceFee,
        cod_service_fee_vat: order.codServiceFeeVat,
        cod_fee_bearer: order.codFeeBearer,
        seller_bank_account_id: order.sellerBankAccountId || null,
        payment_url: paymentUrl,
      },
      payment: payment
        ? {
            channel_code: payment.channelCode,
            fee_bearer: payment.feeBearer,
            status: payment.status,
            amount: payment.amount,
            admin_fee: payment.adminFee,
            total_amount: payment.totalAmount,
            virtual_account: payment.virtualAccount || null,
            qr_payload: payment.qrPayload || null,
            payment_code: payment.paymentCode || null,
            payment_url: paymentUrl,
            expires_at: payment.expiresAt || null,
            error: payment.failedReason || null,
          }
        : data.payment_method === "manual_transfer"
          ? {
              channel_code: order.sellerBankCode,
              bank_name: order.sellerBankName,
              account_holder: order.sellerAccountHolder,
              virtual_account: order.sellerAccountNumber,
              manual_transfer: true,
              fee_bearer: "seller",
              status: "pending",
              amount: order.totalAmount,
              admin_fee: 0,
              total_amount: order.totalAmount,
            }
          : null,
    });
  } catch (error) {
    if (error instanceof DuplicateSubmissionError) {
      return json(
        { success: false, error: error.message, code: "DUPLICATE_SUBMIT" },
        409,
      );
    }
    if (error instanceof OrderInputError) {
      return json(
        { success: false, error: error.message, code: "VALIDATION_ERROR" },
        422,
      );
    }
    console.error("submit-order", error);
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
