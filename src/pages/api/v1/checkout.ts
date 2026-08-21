import type { APIRoute } from 'astro';
import { handleOptions, headlessError, headlessOk, validateHeadlessRequest } from '../../../lib/headless-api';
import { orderSubmitSchema } from '../../../lib/order-schema';
import { getRuntimeEnv } from '../../../lib/env';
import { checkRateLimit, getClientIp } from '../../../lib/rate-limit';
import { loadStoreCodDisabledProvinceCodes } from '../../../lib/form-mode';
import { isProvinceExcluded, normalizeProvinceCode } from '../../../lib/province';
import { persistOrder, DuplicateSubmissionError, OrderInputError } from '../../../lib/order-persistence';
import { resolveEligibleShippingRates } from '../../../lib/shipping-quote';
import { readClickIdCookie, hasClickId, serializeClickIds } from '../../../lib/click-ids';
import { isShippingQuoteFailure, resolveTrustedHeadlessShipping } from '../../../lib/headless-checkout';

export const prerender = false;

export const OPTIONS = handleOptions;

export const POST: APIRoute = async ({ request, locals }) => {
  const validation = await validateHeadlessRequest(request, locals, { operation: 'checkoutCreate' });
  if (!validation.allowed) {
    return validation.errorResponse;
  }

  try {
    const clientIp = getClientIp(request.headers);
    const sessions = getRuntimeEnv(locals)?.SESSION as KVNamespace | undefined;
    const rateLimit = await checkRateLimit(sessions, `headless-checkout:${clientIp}`, 15, 60_000);
    if (!rateLimit.allowed) {
      return validation.finalize(headlessError('Terlalu banyak percobaan order. Silakan tunggu 1 menit.', 429, {
        code: 'RATE_LIMITED',
      }, validation.corsHeaders));
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return validation.finalize(headlessError('Payload JSON order tidak valid.', 400, {
        code: 'INVALID_PAYLOAD',
      }, validation.corsHeaders));
    }

    if (String(body.website || body.honeypot || '').trim()) {
      return validation.finalize(headlessError('Request ditolak.', 400, {
        code: 'HONEYPOT_TRIGGERED',
      }, validation.corsHeaders));
    }

    const parsed = orderSubmitSchema.safeParse(body);
    if (!parsed.success) {
      return validation.finalize(headlessError(parsed.error.errors[0]?.message || 'Data order tidak valid.', 422, {
        code: 'VALIDATION_ERROR',
        errors: parsed.error.format(),
      }, validation.corsHeaders));
    }

    const data = parsed.data;
    const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
    if (!database?.prepare) {
      return validation.finalize(headlessError('Database order belum dikonfigurasi.', 503, {
        code: 'DATABASE_UNAVAILABLE',
      }, validation.corsHeaders));
    }

    const disabledProvinceCodes = await loadStoreCodDisabledProvinceCodes(database);
    const provinceCode = normalizeProvinceCode(data.province);
    if (data.payment_method === 'cod' && (!provinceCode || isProvinceExcluded(provinceCode, disabledProvinceCodes))) {
      return validation.finalize(headlessError('COD tidak tersedia untuk wilayah tujuan ini. Silakan gunakan pembayaran transfer/online.', 422, {
        code: 'COD_DISABLED_FOR_REGION',
      }, validation.corsHeaders));
    }

    const shipping = await resolveTrustedHeadlessShipping(body, data, (input) =>
      resolveEligibleShippingRates(database, locals, input),
    );

    const clickIds = readClickIdCookie(request);
    const storedClickIds = hasClickId(clickIds) ? serializeClickIds(clickIds) : undefined;

    const order = await persistOrder(database, {
      submitToken: data.submit_token,
      customerName: data.customer_name.trim(),
      customerPhone: data.customer_phone,
      customerEmail: data.customer_email || undefined,
      address: data.address,
      province: data.province,
      city: String(body.city || '').trim().slice(0, 120),
      district: data.district,
      postalCode: data.postal_code || undefined,
      variantKey: data.variant_id,
      quantity: data.quantity,
      shippingCost: shipping.shippingCost,
      paymentMethod: data.payment_method,
      sellerBankAccountId: data.seller_bank_account_id,
      warehouseId: shipping.warehouseId,
      destinationAreaId: shipping.destinationId || undefined,
      courierCode: shipping.courierCode,
      courierService: shipping.courierService,
      adClickIds: storedClickIds,
    });

    return validation.finalize(headlessOk(
      {
        order: {
          id: order.id,
          order_number: order.orderNumber,
          public_status_token: order.publicStatusToken,
          total_amount: order.totalAmount,
          unit_price: order.unitPrice,
          cod_service_fee: order.codServiceFee,
          cod_service_fee_vat: order.codServiceFeeVat,
          cod_fee_bearer: order.codFeeBearer,
          seller_bank_name: order.sellerBankName,
          seller_account_holder: order.sellerAccountHolder,
          seller_account_number: order.sellerAccountNumber,
        },
      },
      201,
      validation.corsHeaders
    ));
  } catch (error) {
    if (error instanceof DuplicateSubmissionError) {
      return validation.finalize(headlessError('Order sedang diproses atau sudah dibuat sebelumnya.', 409, {
        code: 'DUPLICATE_ORDER',
      }, validation.corsHeaders));
    }
    if (isShippingQuoteFailure(error)) {
      return validation.finalize(headlessError(error.message, error.status, {
        code: error.code,
      }, validation.corsHeaders));
    }
    if (error instanceof OrderInputError) {
      return validation.finalize(headlessError(error.message, 422, {
        code: 'ORDER_INPUT_ERROR',
      }, validation.corsHeaders));
    }
    return validation.finalize(headlessError('Gagal memproses checkout pesanan.', 500, {
      code: 'CHECKOUT_PROCESSING_ERROR',
      details: error instanceof Error ? error.message : String(error),
    }, validation.corsHeaders));
  }
};
