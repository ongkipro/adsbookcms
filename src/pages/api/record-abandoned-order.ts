import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '../../lib/env.ts';
import { json, jsonError, jsonOk } from '../../lib/api.ts';
import { recordAbandonedOrder } from '../../lib/order-persistence.ts';
import {
  checkRateLimit,
  getClientIp,
  rateLimitHeaders,
} from '../../lib/rate-limit.ts';
import { isValidWa62, normalizePhone } from '../../lib/validation.ts';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = getRuntimeEnv(locals);

  const body = await request.json().catch(() => null) as {
    customer_name?: string;
    customer_phone?: string;
    product_id?: number | string;
    variant_id?: number | string;
    product_title?: string;
    address?: string;
    province?: string;
    total_amount?: number;
    website?: unknown;
    honeypot?: unknown;
  } | null;

  if (!body) {
    return jsonError('Payload tidak valid.', 400);
  }

  if (String(body.website || body.honeypot || '').trim()) {
    return jsonError('Request tidak valid.', 400, {
      code: 'HONEYPOT_TRIGGERED',
    });
  }

  const clientIp = getClientIp(request.headers);
  const sessions = runtime?.SESSION as KVNamespace | undefined;
  const rateLimit = await checkRateLimit(
    sessions,
    `record-abandoned-order:${clientIp}`,
    10,
    60_000,
  );
  if (!rateLimit.allowed) {
    return json(
      {
        success: false,
        error: 'Terlalu banyak percobaan. Coba lagi sebentar.',
        code: 'RATE_LIMITED',
      },
      429,
      rateLimitHeaders(rateLimit.remaining, rateLimit.resetAt),
    );
  }

  const database = runtime?.OMS_DB;
  if (!database || typeof database !== 'object') {
    return jsonError('Database order belum tersedia.', 503);
  }

  const customerName = String(body.customer_name || '').trim();
  const customerPhone = normalizePhone(String(body.customer_phone || ''));

  if (customerName.length < 3) {
    return jsonError('Nama pelanggan minimal 3 karakter.', 400);
  }
  if (!isValidWa62(customerPhone)) {
    return jsonError('Nomor WhatsApp tidak valid.', 400);
  }

  const numericTotalAmount = Number(body.total_amount);
  const variantId = Number(body.variant_id);
  try {
    const recorded = await recordAbandonedOrder(database as D1Database, {
      customerName,
      customerPhone,
      address: String(body.address || ''),
      province: String(body.province || ''),
      totalAmount: Number.isFinite(numericTotalAmount)
        ? numericTotalAmount
        : undefined,
      variantId:
        Number.isInteger(variantId) && variantId > 0 ? variantId : undefined,
    });
    return jsonOk({
      success: true,
      action: recorded.action,
      order_number: recorded.orderNumber,
    });
  } catch (error) {
    console.error('record-abandoned-order error:', error);
    if (
      error instanceof Error &&
      error.message === 'Store belum dikonfigurasi.'
    ) {
      return jsonError(error.message, 503);
    }
    return jsonError('Gagal mencatat pesanan tertinggal.', 500);
  }
};
