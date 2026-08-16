import type { APIRoute } from 'astro';
import { handleOptions, headlessError, headlessOk, validateHeadlessRequest } from '../../../../lib/headless-api';
import { getRuntimeEnv } from '../../../../lib/env';
import { resolveEligibleShippingRates, ShippingQuoteError } from '../../../../lib/shipping-quote';

export const prerender = false;

export const OPTIONS = handleOptions;

export const GET: APIRoute = async (context) => calculateRates(context);
export const POST: APIRoute = async (context) => calculateRates(context);

async function calculateRates({ request, url, locals }: Parameters<APIRoute>[0]) {
  const validation = await validateHeadlessRequest(request, locals);
  if (!validation.allowed && validation.errorResponse) {
    return validation.errorResponse;
  }

  try {
    let body: Record<string, unknown> = {};
    if (request.method === 'POST') {
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        body = {};
      }
    }

    const destinationId = String(
      body.destination_id ||
      body.location_id ||
      url.searchParams.get('destination_id') ||
      url.searchParams.get('location_id') ||
      ''
    ).trim();

    if (!destinationId) {
      return headlessError('destination_id / location_id wajib diisi.', 400, {
        code: 'DESTINATION_ID_REQUIRED',
      }, validation.corsHeaders);
    }

    const paymentMethod = String(
      body.payment_method || url.searchParams.get('payment_method') || 'cod'
    ).toLowerCase();
    const variantKey = String(
      body.variant_id || url.searchParams.get('variant_id') || ''
    ).trim();
    const quantity = Math.max(
      1,
      parseInt(String(body.quantity || url.searchParams.get('quantity') || '1'), 10)
    );
    const weight = Number(body.weight || url.searchParams.get('weight') || 1);

    const env = getRuntimeEnv(locals);
    const database = env?.OMS_DB as D1Database | undefined;
    if (!database) {
      return headlessError('Database belum dikonfigurasi.', 503, {
        code: 'DATABASE_UNAVAILABLE',
      }, validation.corsHeaders);
    }

    const { originId, rates, fallbackUsed } = await resolveEligibleShippingRates(
      database,
      locals,
      {
        destinationId,
        paymentMethod,
        variantKey: variantKey || undefined,
        fallbackWeightKg: weight > 100 ? weight / 1000 : weight,
        quantity,
      }
    );

    return headlessOk(
      {
        destination_id: destinationId,
        payment_method: paymentMethod,
        origin_id: originId,
        fallback_used: Boolean(fallbackUsed),
        rates: rates.map((r) => ({
          courier_code: r.courier_code,
          courier_service: r.courier_service,
          price: r.price,
          estimated_days: r.estimated_days,
          cod_available: !r.unsupported_cod,
          cod_fee: r.cod_fee || 0,
          total_shipping: r.price + (paymentMethod === 'cod' ? Number(r.cod_fee || 0) : 0),
        })),
      },
      200,
      validation.corsHeaders
    );
  } catch (error) {
    const quoteErr = error instanceof ShippingQuoteError ? error : null;
    return headlessError(
      quoteErr?.message || 'Gagal menghitung tarif pengiriman.',
      quoteErr?.status || 500,
      { code: quoteErr?.code || 'SHIPPING_RATES_ERROR' },
      validation.corsHeaders
    );
  }
}
