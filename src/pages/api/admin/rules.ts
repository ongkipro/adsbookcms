import type { APIRoute } from 'astro';
import { jsonError, jsonOk } from '../../../lib/api';
import { getRuntimeEnv } from '../../../lib/env';

export const prerender = false;

type RulesPayload = {
  cod_disabled_provinces?: string[];
  active_couriers?: string[];
};

type CourierRuleRow = {
  id: number;
  courier_code: string;
  is_enabled: number | boolean | null;
  excluded_provinces: string | null;
};

function normalizeStringList(values: unknown, maxItems: number, maxLength: number, mode: 'lower' | 'keep' = 'keep') {
  if (!Array.isArray(values)) return null;

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    if (typeof value !== 'string') continue;
    const nextValue = (mode === 'lower' ? value.toLowerCase() : value).trim().slice(0, maxLength);
    if (!nextValue || seen.has(nextValue)) continue;
    seen.add(nextValue);
    normalized.push(nextValue);
    if (normalized.length > maxItems) return null;
  }

  return normalized;
}

export const GET: APIRoute = async ({ locals }) => {
  const database = getRuntimeEnv(locals)?.OMS_DB;
  if (!database || typeof database !== 'object') {
    return jsonError('Database aturan kurir belum tersedia.', 503);
  }

  try {
    const rows = ((await (database as D1Database).prepare(`
      SELECT id, courier_code, is_enabled, excluded_provinces
      FROM courier_rules
      ORDER BY courier_code ASC
    `).all()).results ?? []) as CourierRuleRow[];

    const activeCouriers = rows.filter((row) => Boolean(row.is_enabled)).map((row) => row.courier_code);
    const provinceSet = new Set<string>();

    for (const row of rows) {
      const parts = String(row.excluded_provinces || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      for (const province of parts) provinceSet.add(province);
    }

    return jsonOk({
      cod_disabled_provinces: Array.from(provinceSet).sort((left, right) => left.localeCompare(right, 'id-ID')),
      active_couriers: activeCouriers,
    });
  } catch (error) {
    console.error('admin-rules-get', error);
    return jsonError('Gagal mengambil aturan kurir.', 500);
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  const database = getRuntimeEnv(locals)?.OMS_DB;
  if (!database || typeof database !== 'object') {
    return jsonError('Database aturan kurir belum tersedia.', 503);
  }

  const body = (await request.json().catch(() => null)) as RulesPayload | null;
  if (!body) return jsonError('Payload tidak valid.', 400);
  if (body.active_couriers === undefined && body.cod_disabled_provinces === undefined) {
    return jsonError('Minimal satu pengaturan kurir wajib diisi.', 400);
  }

  try {
    const db = database as D1Database;
    const rows = ((await db.prepare(`
      SELECT id, courier_code, is_enabled, excluded_provinces
      FROM courier_rules
      ORDER BY courier_code ASC
    `).all()).results ?? []) as CourierRuleRow[];

    if (rows.length === 0) {
      return jsonError('Aturan kurir belum tersedia.', 404);
    }

    const normalizedCouriers = body.active_couriers === undefined
      ? rows.filter((row) => Boolean(row.is_enabled)).map((row) => row.courier_code)
      : normalizeStringList(body.active_couriers, 100, 40);
    if (!normalizedCouriers) {
      return jsonError('Daftar kurir aktif tidak valid.', 400);
    }

    const existingCodes = new Set(rows.map((row) => row.courier_code));
    const unknownCourier = normalizedCouriers.find((code) => !existingCodes.has(code));
    if (unknownCourier) {
      return jsonError(`Kurir ${unknownCourier} tidak ditemukan.`, 400);
    }

    const normalizedProvinces = body.cod_disabled_provinces === undefined
      ? Array.from(new Set(rows.flatMap((row) => String(row.excluded_provinces || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean))))
      : normalizeStringList(body.cod_disabled_provinces, 200, 120, 'lower');
    if (!normalizedProvinces) {
      return jsonError('Daftar provinsi COD tidak valid.', 400);
    }

    const serializedProvinces = normalizedProvinces.join(',');
    const activeCodeSet = new Set(normalizedCouriers);
    await db.batch(
      rows.map((row) => db.prepare(`
        UPDATE courier_rules
        SET is_enabled = ?, excluded_provinces = ?
        WHERE id = ?
      `).bind(activeCodeSet.has(row.courier_code) ? 1 : 0, serializedProvinces || null, row.id)),
    );

    return jsonOk({
      message: 'Pengaturan kurir & COD berhasil diperbarui',
      data: {
        cod_disabled_provinces: normalizedProvinces,
        active_couriers: normalizedCouriers,
      },
    });
  } catch (error) {
    console.error('admin-rules-put', error);
    return jsonError('Gagal memperbarui aturan kurir.', 500);
  }
};
