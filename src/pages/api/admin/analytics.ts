import type { APIRoute } from 'astro';
import { jsonError, jsonOk } from '../../../lib/api';
import { getRuntimeEnv } from '../../../lib/env';

export const prerender = false;

type AnalyticsRow = {
  total_orders: number | string | null;
  total_revenue: number | string | null;
  returned_orders: number | string | null;
  paid_orders: number | string | null;
  cod_orders: number | string | null;
  transfer_orders: number | string | null;
  qris_orders: number | string | null;
};

type TrendRow = {
  date: string;
  revenue: number | string | null;
  orders: number | string | null;
};
const isIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

export const GET: APIRoute = async ({ locals, url }) => {
  const database = getRuntimeEnv(locals)?.OMS_DB;
  if (!database || typeof database !== 'object') {
    return jsonError('Database analytics belum tersedia.', 503);
  }

  const startParam = url.searchParams.get('startDate');
  const endParam = url.searchParams.get('endDate');
  if (
    (startParam && !isIsoDate(startParam)) ||
    (endParam && !isIsoDate(endParam))
  ) {
    return jsonError('Rentang tanggal tidak valid.', 400);
  }
  if (startParam && endParam) {
    const startTime = Date.parse(`${startParam}T00:00:00.000Z`);
    const endTime = Date.parse(`${endParam}T00:00:00.000Z`);
    if (endTime < startTime || (endTime - startTime) / 86_400_000 > 30) {
      return jsonError('Rentang tanggal maksimal 31 hari.', 400);
    }
  }
  const interval = url.searchParams.get('interval') === 'hour' ? 'hour' : 'day';
  
  let dateFilter = "";
  const params: string[] = [];
  
  if (startParam && endParam) {
    dateFilter = "WHERE date(created_at, '+7 hours') BETWEEN ? AND ?";
    params.push(startParam, endParam);
  } else if (startParam) {
    dateFilter = "WHERE date(created_at, '+7 hours') >= ?";
    params.push(startParam);
  } else if (endParam) {
    dateFilter = "WHERE date(created_at, '+7 hours') <= ?";
    params.push(endParam);
  }

  try {
    const row = await (database as D1Database).prepare(`
      SELECT
        COUNT(*) AS total_orders,
        COALESCE(SUM(total_amount), 0) AS total_revenue,
        COALESCE(SUM(CASE WHEN shipping_status = 'returned' THEN 1 ELSE 0 END), 0) AS returned_orders,
        COALESCE(SUM(CASE WHEN payment_status IN ('paid', 'settled', 'success') THEN 1 ELSE 0 END), 0) AS paid_orders,
        COALESCE(SUM(CASE WHEN payment_method = 'cod' THEN 1 ELSE 0 END), 0) AS cod_orders,
        COALESCE(SUM(CASE WHEN payment_method = 'bank_transfer' THEN 1 ELSE 0 END), 0) AS transfer_orders,
        COALESCE(SUM(CASE WHEN payment_method = 'qris' THEN 1 ELSE 0 END), 0) AS qris_orders
      FROM orders
      ${dateFilter}
    `).bind(...params).first() as AnalyticsRow | null;

    const totalOrders = Number(row?.total_orders ?? 0);
    const totalRevenue = Number(row?.total_revenue ?? 0);
    const returnedOrders = Number(row?.returned_orders ?? 0);
    const paidOrders = Number(row?.paid_orders ?? 0);
    const codOrders = Number(row?.cod_orders ?? 0);
    const transferOrders = Number(row?.transfer_orders ?? 0);
    const qrisOrders = Number(row?.qris_orders ?? 0);
    const ratio = (value: number) => (totalOrders > 0 ? Number(((value / totalOrders) * 100).toFixed(2)) : 0);

    const groupBy = interval === 'hour' ? "STRFTIME('%Y-%m-%d %H:00:00', created_at, '+7 hours')" : "DATE(created_at, '+7 hours')";
    const trendsResult = await (database as D1Database).prepare(`
      SELECT 
        ${groupBy} as date,
        COALESCE(SUM(total_amount), 0) as revenue,
        COUNT(*) as orders
      FROM orders
      ${dateFilter ? dateFilter : "WHERE 1=1"}
      GROUP BY ${groupBy}
      ORDER BY date ASC
    `).bind(...params).all<TrendRow>();

    const trends = [];
    if (startParam && endParam) {
      if (interval === 'hour') {
        // Generate 24 hours for the start date
        const baseDate = startParam; // YYYY-MM-DD
        for (let i = 0; i < 24; i++) {
          const hourStr = String(i).padStart(2, '0');
          const dateStr = `${baseDate} ${hourStr}:00:00`;
          const match = trendsResult.results?.find(r => r.date === dateStr);
          trends.push({
            date: dateStr,
            revenue: Number(match?.revenue ?? 0),
            orders: Number(match?.orders ?? 0)
          });
        }
      } else {
        // Generate complete date sequence for the range to avoid gaps
        const start = new Date(startParam);
        const end = new Date(endParam);
        
        const diffTime = end.getTime() - start.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        for (let i = diffDays; i >= 0; i--) {
          const d = new Date(end);
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          const match = trendsResult.results?.find(r => r.date === dateStr);
          trends.push({
            date: dateStr,
            revenue: Number(match?.revenue ?? 0),
            orders: Number(match?.orders ?? 0)
          });
        }
      }
    } else {
      // Default fallback (e.g. All Data) just returns existing grouped results
      trendsResult.results?.forEach(r => {
        trends.push({
          date: r.date,
          revenue: Number(r.revenue ?? 0),
          orders: Number(r.orders ?? 0)
        });
      });
    }

    return jsonOk({
      data: {
        total_revenue: totalRevenue,
        total_orders: totalOrders,
        conversion_rate: ratio(paidOrders),
        rts_rate: ratio(returnedOrders),
        cod_percentage: ratio(codOrders),
        transfer_percentage: ratio(transferOrders),
        qris_percentage: ratio(qrisOrders),
        trends
      },
      message: totalOrders > 0 ? 'Analytics dihitung dari data order D1 saat ini.' : 'Belum ada order untuk dihitung.',
    });
  } catch (error) {
    console.error('admin-analytics-get', error);
    return jsonError('Gagal mengambil data analytics.', 500);
  }
};
