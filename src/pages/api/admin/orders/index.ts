import type { APIRoute } from 'astro';
import { jsonError, jsonOk } from '../../../../lib/api.ts';
import { parseCrmTemplates } from '../../../../lib/crm-template.ts';
import { getRuntimeEnv } from '../../../../lib/env.ts';
import { dispatchOrderToMengantar } from '../../../../lib/mengantar-dispatch.ts';
import {
  runMengantarOrderQueue,
  summarizeMengantarDispatchResults,
} from '../../../../lib/mengantar-order.ts';
import { getMengantarDispatchEligibility } from '../../../../lib/payment-dispatch-policy.ts';
import {
  ADMIN_SHIPPING_STATUSES,
  deleteOrdersRestoringStock,
  OrderLifecycleError,
  updateAdminOrderShippingStatuses,
} from '../../../../lib/order-lifecycle.ts';
import type { AdminShippingStatus } from '../../../../lib/order-lifecycle.ts';
import { scheduleReceiverPerformanceRefresh } from '../../../../lib/rts-scoring.ts';
import {
  isAdminDateFilter,
  resolveAdminDateRange,
} from '../../../../lib/admin-date-filter.ts';

export const prerender = false;

const BULK_SHIPPING_STATUSES = ADMIN_SHIPPING_STATUSES;
const SHIPPING_STATUSES = ['all', ...BULK_SHIPPING_STATUSES] as const;
const PAYMENT_STATUSES = ['all', 'unpaid', 'paid', 'settled', 'success', 'failed', 'refunded', 'expired'] as const;

type OrderRow = {
  id: number;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  address: string;
  district: string;
  city: string;
  province: string;
  product_name: string | null;
  variant_name: string | null;
  product_price: number;
  total_amount: number;
  shipping_cost: number;
  payment_method: string;
  payment_status: string;
  shipping_status: string;
  courier_code: string | null;
  cnote_no: string | null;
  seller_name: string | null;
  seller_bank_name: string | null;
  seller_account_holder: string | null;
  seller_account_number: string | null;
  epayment_link: string | null;
  destination_area_id: string | null;
  provider_order_id: string | null;
  provider_dispatch_error: string | null;
  provider_dispatch_claimed_at: string | null;
  pickup_address_id: string | null;
  receiver_delivery_rate: number | null;
  receiver_risk_label: string | null;
  ad_click_ids: string | null;
  created_at: string;
};

type OrderSummaryRow = {
  total_orders: number | string;
  unpaid_count: number | string;
  high_risk_count: number | string;
  total_value: number | string;
};

type OrderStatusCountRow = {
  shipping_status: string;
  count: number | string;
};

type OrderMutation = {
  action?: 'dispatch-orders';
  orderIds?: Array<number | string>;
  order_ids?: string[];
  status?: string;
};

export type BulkStatusUpdate = {
  orderIds: number[];
  status: AdminShippingStatus;
};

export function parseBulkStatusUpdate(body: unknown): BulkStatusUpdate {
  if (!body || typeof body !== 'object') {
    throw new Error('Payload order tidak valid.');
  }
  const payload = body as Record<string, unknown>;
  const status = String(payload.status || '').trim().toLowerCase();
  if (
    !BULK_SHIPPING_STATUSES.includes(
      status as BulkStatusUpdate['status'],
    )
  ) {
    throw new Error('Status pengiriman tidak valid.');
  }
  if (!Array.isArray(payload.order_ids)) {
    throw new Error('Daftar ID order wajib diisi.');
  }
  if (
    payload.order_ids.some(
      (orderId) => typeof orderId !== 'string' || !/^\d+$/.test(orderId),
    )
  ) {
    throw new Error('ID order harus berupa string angka.');
  }
  const orderIds = Array.from(
    new Set((payload.order_ids as string[]).map(Number)),
  ).filter((orderId) => Number.isInteger(orderId) && orderId > 0);
  if (orderIds.length === 0 || orderIds.length > 100) {
    throw new Error('Pilih 1 sampai 100 order untuk diperbarui.');
  }
  return { orderIds, status: status as BulkStatusUpdate['status'] };
}


export const GET: APIRoute = async ({ url, locals }) => {
  const database = getRuntimeEnv(locals)?.OMS_DB;
  if (!database || typeof database !== 'object') {
    return jsonError('Database order belum tersedia.', 503);
  }

  const search = String(url.searchParams.get('search') || '').trim().slice(0, 120);
  const shippingStatus = String(url.searchParams.get('shipping_status') || 'all').trim().toLowerCase();
  const paymentStatus = String(url.searchParams.get('payment_status') || 'all').trim().toLowerCase();
  const dateFilter = String(url.searchParams.get('date_filter') || 'all').trim().toLowerCase();
  const sourceFilter = String(url.searchParams.get('source') || 'all').trim().toLowerCase();
  const page = Math.max(Number.parseInt(url.searchParams.get('page') || '1', 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') || '25', 10) || 25, 1), 100);
  if (!SHIPPING_STATUSES.includes(shippingStatus as (typeof SHIPPING_STATUSES)[number])) {
    return jsonError('Filter status pengiriman tidak valid.', 400);
  }
  if (!PAYMENT_STATUSES.includes(paymentStatus as (typeof PAYMENT_STATUSES)[number])) {
    return jsonError('Filter status pembayaran tidak valid.', 400);
  }
  if (!isAdminDateFilter(dateFilter)) {
    return jsonError('Filter periode order tidak valid.', 400);
  }

  try {
    let whereClause = '';
    const whereParts: string[] = ["shipping_status <> 'abandoned'"];
    const params: unknown[] = [];

    if (search) {
      const term = `%${search}%`;
      whereParts.push('(customer_name LIKE ? OR customer_phone LIKE ? OR order_number LIKE ? OR cnote_no LIKE ?)');
      params.push(term, term, term, term);
    }

    if (shippingStatus !== 'all') {
      whereParts.push('shipping_status = ?');
      params.push(shippingStatus);
    }
    if (paymentStatus !== 'all') {
      whereParts.push('payment_status = ?');
      params.push(paymentStatus);
    }
    if (dateFilter !== 'all') {
      const { start, end } = resolveAdminDateRange(dateFilter);
      whereParts.push("date(created_at, '+7 hours') BETWEEN ? AND ?");
      params.push(start, end);
    }
    if (sourceFilter === 'meta') {
      whereParts.push("(ad_click_ids LIKE '%fbclid%' OR ad_click_ids LIKE '%_fbc%' OR ad_click_ids LIKE '%meta%' OR ad_click_ids LIKE '%facebook%' OR ad_click_ids LIKE '%instagram%')");
    } else if (sourceFilter === 'google') {
      whereParts.push("(ad_click_ids LIKE '%gclid%' OR ad_click_ids LIKE '%gbraid%' OR ad_click_ids LIKE '%wbraid%' OR ad_click_ids LIKE '%google%')");
    } else if (sourceFilter === 'tiktok') {
      whereParts.push("(ad_click_ids LIKE '%ttclid%' OR ad_click_ids LIKE '%tiktok%')");
    } else if (sourceFilter === 'organic') {
      whereParts.push("(ad_click_ids IS NULL OR ad_click_ids = '' OR ad_click_ids = '{}' OR (ad_click_ids NOT LIKE '%fbclid%' AND ad_click_ids NOT LIKE '%gclid%' AND ad_click_ids NOT LIKE '%ttclid%' AND ad_click_ids NOT LIKE '%gbraid%' AND ad_click_ids NOT LIKE '%wbraid%'))");
    }

    whereClause = ` WHERE ${whereParts.join(' AND ')}`;
    const offset = (page - 1) * limit;
    const db = database as D1Database;

    const countStmt = db
      .prepare(`SELECT COUNT(*) AS total_items FROM orders${whereClause}`)
      .bind(...params);
    const ordersStmt = db.prepare(`
        SELECT
          id,
          order_number,
          customer_name,
          customer_phone,
          address,
          district,
          city,
          province,
          (
            SELECT GROUP_CONCAT(COALESCE(products.title, product_variants.title, ''), ', ')
            FROM order_items
            LEFT JOIN product_variants ON product_variants.id = order_items.variant_id
            LEFT JOIN products ON products.id = product_variants.product_id
            WHERE order_items.order_id = orders.id
          ) AS product_name,
          (
            SELECT GROUP_CONCAT(product_variants.title, ', ')
            FROM order_items
            LEFT JOIN product_variants ON product_variants.id = order_items.variant_id
            WHERE order_items.order_id = orders.id
          ) AS variant_name,
          (
            SELECT COALESCE(SUM(order_items.quantity * order_items.unit_price), 0)
            FROM order_items
            WHERE order_items.order_id = orders.id
          ) AS product_price,
          total_amount,
          shipping_cost,
          payment_method,
          payment_status,
          shipping_status,
          courier_code,
          cnote_no,
          (
            SELECT name
            FROM stores
            WHERE stores.id = orders.store_id
          ) AS seller_name,
          seller_bank_name,
          seller_account_holder,
          seller_account_number,
          (
            SELECT provider_payment_url
            FROM payment_transactions
            WHERE payment_transactions.order_id = orders.id
            ORDER BY payment_transactions.id DESC
            LIMIT 1
          ) AS epayment_link,
          destination_area_id,
          provider_order_id,
          provider_dispatch_error,
          provider_dispatch_claimed_at,
          (
            SELECT pickup_address_id
            FROM warehouses
            WHERE warehouses.id = orders.warehouse_id
          ) AS pickup_address_id,
          receiver_rts_score AS receiver_delivery_rate,
          rts_risk_label AS receiver_risk_label,
          ad_click_ids,
          created_at
        FROM orders
        ${whereClause}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `).bind(...params, limit, offset);
    const [countResult, rowResult, summaryResult, crmResult, statusCountResult] = await db.batch([
      countStmt,
      ordersStmt,
      db.prepare(`
        SELECT
          COUNT(*) AS total_orders,
          SUM(CASE WHEN payment_status = 'unpaid' THEN 1 ELSE 0 END) AS unpaid_count,
          SUM(CASE WHEN UPPER(COALESCE(rts_risk_label, '')) LIKE '%HIGH%' THEN 1 ELSE 0 END) AS high_risk_count,
          COALESCE(SUM(total_amount), 0) AS total_value
        FROM orders
        WHERE shipping_status <> 'abandoned'
      `),
      db.prepare("SELECT crm_templates FROM stores ORDER BY id LIMIT 1"),
      db.prepare(`
        SELECT shipping_status, COUNT(*) AS count
        FROM orders
        WHERE shipping_status <> 'abandoned'
        GROUP BY shipping_status
      `),
    ]);

    const totalItems = Number((countResult.results?.[0] as { total_items?: number | string } | undefined)?.total_items ?? 0);
    const totalPages = totalItems > 0 ? Math.ceil(totalItems / limit) : 0;
    const summary = (summaryResult.results?.[0] ?? {}) as Partial<OrderSummaryRow>;
    const crmTemplates = parseCrmTemplates(
      (crmResult.results?.[0] as { crm_templates?: string | null } | undefined)
        ?.crm_templates ?? null,
    );
    const statusCounts = Object.fromEntries(
      ((statusCountResult.results ?? []) as OrderStatusCountRow[]).map((row) => [
        row.shipping_status,
        Number(row.count) || 0,
      ]),
    );
    const fallbackPickupAddressId = String(
      getRuntimeEnv(locals)?.MENGANTAR_PICKUP_ADDRESS_ID || '',
    ).trim();

    const rows = (rowResult.results ?? []) as OrderRow[];
    for (const row of rows.slice(0, 10)) {
      if (row.receiver_risk_label === null && row.customer_phone) {
        scheduleReceiverPerformanceRefresh(db, row.order_number, row.customer_phone, locals);
      }
    }

    return jsonOk({
      data: ((rowResult.results ?? []) as OrderRow[]).map((row) => {
        const dispatch = getMengantarDispatchEligibility({
          paymentMethod: row.payment_method,
          paymentStatus: row.payment_status,
          shippingStatus: row.shipping_status,
          providerOrderId: row.provider_order_id,
          providerDispatchError: row.provider_dispatch_error,
          providerDispatchClaimedAt: row.provider_dispatch_claimed_at,
          destinationAreaId: row.destination_area_id,
          courierCode: row.courier_code,
          pickupAddressId: row.pickup_address_id || fallbackPickupAddressId,
        });
        return {
          id: row.id,
          order_number: row.order_number,
          customer_name: row.customer_name,
          customer_phone: row.customer_phone,
          address: row.address,
          district: row.district,
          city: row.city,
          province: row.province,
          product_name: row.product_name,
          variant_name: row.variant_name,
          product_price: row.product_price,
          total_amount: row.total_amount,
          shipping_cost: row.shipping_cost,
          payment_method: row.payment_method,
          payment_status: row.payment_status,
          shipping_status: row.shipping_status,
          courier_code: row.courier_code,
          cnote_no: row.cnote_no,
          seller_name: row.seller_name,
          seller_bank_name: row.seller_bank_name,
          seller_account_holder: row.seller_account_holder,
          seller_account_number: row.seller_account_number,
          epayment_link: row.epayment_link,
          dispatch_eligible: dispatch.eligible,
          dispatch_reason: dispatch.reason,
          provider_dispatch_error: row.provider_dispatch_error,
          receiver_delivery_rate: row.receiver_delivery_rate,
          receiver_risk_label: row.receiver_risk_label,
          ad_click_ids: row.ad_click_ids,
          created_at: row.created_at,
        };
      }),
      crm_templates: crmTemplates,
      pagination: {
        page,
        limit,
        total_items: totalItems,
        total_pages: totalPages,
      },
      summary: {
        total_orders: Number(summary.total_orders ?? 0),
        unpaid_count: Number(summary.unpaid_count ?? 0),
        high_risk_count: Number(summary.high_risk_count ?? 0),
        total_value: Number(summary.total_value ?? 0),
      },
      status_counts: {
        all: Number(summary.total_orders ?? 0),
        pending: statusCounts.pending || 0,
        processing: statusCounts.processing || 0,
        shipped: statusCounts.shipped || 0,
        delivered: statusCounts.delivered || 0,
        cancelled: statusCounts.cancelled || 0,
      },
    });
  } catch (error) {
    console.error('admin-orders-get', error);
    return jsonError('Gagal mengambil data orders.', 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const database = getRuntimeEnv(locals)?.OMS_DB;
  if (!database || typeof database !== 'object') {
    return jsonError('Database order belum tersedia.', 503);
  }
  const body = (await request.json().catch(() => null)) as OrderMutation | null;
  if (!body) {
    return jsonError('Payload order tidak valid.', 400);
  }

  if (Array.isArray(body.order_ids) || typeof body.status === 'string') {
    let update: BulkStatusUpdate;
    try {
      update = parseBulkStatusUpdate(body);
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : 'Payload order tidak valid.',
        400,
      );
    }

    try {
      const updatedCount = await updateAdminOrderShippingStatuses(
        database as D1Database,
        update.orderIds,
        update.status,
      );
      return jsonOk({
        message: `${updatedCount} order berhasil diubah ke status ${update.status}.`,
        data: {
          updated_count: updatedCount,
          order_ids: update.orderIds.map(String),
          status: update.status,
        },
      });
    } catch (error) {
      if (error instanceof OrderLifecycleError) {
        return jsonError(error.message, error.status);
      }
      console.error('admin-orders-bulk-status', error);
      return jsonError('Gagal memperbarui status order.', 500);
    }
  }

  if (body.action !== 'dispatch-orders') {
    return jsonError('Aksi order tidak valid.', 400);
  }
  const orderIds = Array.from(
    new Set((Array.isArray(body.orderIds) ? body.orderIds : []).map(Number)),
  ).filter((orderId) => Number.isInteger(orderId) && orderId > 0);
  if (orderIds.length === 0 || orderIds.length > 50) {
    return jsonError('Pilih 1 sampai 50 order untuk dikirim ke Mengantar.', 400);
  }

  const db = database as D1Database;
  const results = await runMengantarOrderQueue(
    orderIds,
    (orderId) => dispatchOrderToMengantar(db, locals, orderId),
  );
  const dispatchSummary = summarizeMengantarDispatchResults(results);
  return jsonOk({
    message: `${dispatchSummary.created} order berhasil dibuat di Mengantar; ${dispatchSummary.unpaid} draft menunggu top up; ${dispatchSummary.failed} gagal; ${dispatchSummary.skipped} belum diproses.`,
    data: { results, summary: dispatchSummary },
  });
};
export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!locals.admin) return jsonError('Unauthorized', 401);
  const database = getRuntimeEnv(locals)?.OMS_DB;
  if (!database || typeof database !== 'object') {
    return jsonError('Database order belum tersedia.', 503);
  }
  try {
    const body = (await request.json().catch(() => null)) as { ids?: (number | string)[] } | null;
    const ids = Array.from(
      new Set((body?.ids || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))
    );

    if (ids.length === 0) {
      return jsonError('Tidak ada ID order valid yang dipilih untuk dihapus.', 400);
    }

    const db = database as D1Database;
    const deleted = await deleteOrdersRestoringStock(db, ids);

    return jsonOk({
      success: true,
      deleted_count: deleted.length,
      deleted_ids: deleted.map((order) => order.id),
    });
  } catch (error) {
    if (error instanceof OrderLifecycleError) {
      return jsonError(error.message, error.status);
    }
    console.error('DELETE admin/orders error:', error);
    return jsonError('Gagal menghapus pesanan.', 500);
  }
};
