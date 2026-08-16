import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '../../lib/env';
import { jsonError, jsonOk } from '../../lib/api';
import { recordAbandonedOrder } from '../../lib/order-persistence';
import { isValidWa62, normalizePhone } from '../../lib/validation';

export const POST: APIRoute = async ({ request, locals }) => {
  const database = getRuntimeEnv(locals)?.OMS_DB;
  if (!database || typeof database !== 'object') {
    return jsonError('Database order belum tersedia.', 503);
  }

  const body = await request.json().catch(() => null) as {
    customer_name?: string;
    customer_phone?: string;
    product_id?: number | string;
    variant_id?: number | string;
    product_title?: string;
    address?: string;
    province?: string;
    total_amount?: number;
  } | null;

  if (!body) {
    return jsonError('Payload tidak valid.', 400);
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
    return jsonError('Gagal mencatat order terbengkalai.', 500);
  }
};
