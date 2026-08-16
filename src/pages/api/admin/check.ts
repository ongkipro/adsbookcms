import type { APIRoute } from 'astro';
import { jsonError, jsonOk } from '../../../lib/api';
import { getRuntimeEnv } from '../../../lib/env';
import { getReceiverPerformance } from '../../../lib/rts-scoring';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const phone = String(url.searchParams.get('search') || '').trim();
  if (!phone) {
    return jsonError('Query parameter search (nomor WA) wajib diisi', 400);
  }

  const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
  if (!database?.prepare) {
    return jsonError('Database order belum tersedia', 503);
  }

  try {
    const performance = await getReceiverPerformance(database, phone, locals);

    return jsonOk({
      phone: performance.phone,
      performance,
    });
  } catch (error) {
    console.error('admin-scoring-get', error);
    const message = error instanceof Error && error.message ? error.message : 'Gagal query receiver score Mengantar.';
    const status = message.includes('timeout') ? 504 : 502;
    return jsonError(message, status);
  }
};
