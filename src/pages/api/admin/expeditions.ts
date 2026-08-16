import type { APIRoute } from 'astro';
import { z } from 'zod';
import { jsonError, jsonOk } from '../../../lib/api';
import { getEnvValue, getRuntimeEnv } from '../../../lib/env';
import { MengantarClient } from '../../../lib/mengantar-client';
import { getProviderConfig } from '../../../lib/provider-config';
import {
  parseProvinceCodeList,
  validateProvinceCodeList,
} from '../../../lib/province';

export const prerender = false;

type CourierRule = {
  id: number;
  courierCode: string;
  isEnabled: number;
  isCodEnabled: number;
  excludedProvinces: string | null;
};

type OriginWarehouse = {
  id: number;
  name: string;
  originAreaId: string;
  originLabel: string | null;
  address: string;
  city: string;
  province: string;
};
const expeditionMutationSchema = z.union([
  z
    .object({
      courierId: z.number().int().positive(),
      field: z.enum(['enabled', 'cod']),
      value: z.boolean(),
    })
    .strict(),
  z
    .object({
      codDisabledProvinceCodes: z.array(z.string()),
    })
    .strict(),
]);

const testRateSchema = z
  .object({
    action: z.literal('test-rate').optional(),
    destinationAreaId: z.string().trim().min(1).max(200),
    weightGrams: z.number().int().positive().max(1_000_000).default(1_000),
  })
  .strict();


const COURIER_NAMES: Record<string, string> = {
  jne: 'JNE Express',
  sicepat: 'SiCepat Ekspres',
  jt: 'J&T Express',
  sap: 'SAP Express',
  ninja: 'Ninja Xpress',
  anteraja: 'Anteraja',
  lion: 'Lion Parcel',
  idexpress: 'ID Express',
  paxel: 'Paxel',
  pos: 'Pos Indonesia',
};



const getDatabase = (locals: App.Locals) => {
  const database = getRuntimeEnv(locals)?.OMS_DB;
  return database &&
    typeof database === 'object' &&
    typeof (database as D1Database).prepare === 'function'
    ? database as D1Database
    : null;
};

const listCourierRules = (database: D1Database) =>
  database.prepare(`
    SELECT
      id,
      courier_code AS courierCode,
      is_enabled AS isEnabled,
      is_cod_enabled AS isCodEnabled,
      excluded_provinces AS excludedProvinces
    FROM courier_rules
    WHERE store_id = (SELECT id FROM stores ORDER BY id LIMIT 1)
    ORDER BY courier_code
  `).all<CourierRule>();

const getOriginWarehouse = (database: D1Database) =>
  database.prepare(`
    SELECT
      id,
      name,
      origin_area_id AS originAreaId,
      origin_label AS originLabel,
      address,
      city,
      province
    FROM warehouses
    WHERE store_id = (SELECT id FROM stores ORDER BY id LIMIT 1)
    ORDER BY id
    LIMIT 1
  `).first<OriginWarehouse>();

export const GET: APIRoute = async ({ locals }) => {
  const database = getDatabase(locals);
  if (!database) return jsonError('Database ekspedisi belum tersedia.', 500);

  try {
    const [courierResult, store, originWarehouse] = await Promise.all([
      listCourierRules(database),
      database
        .prepare(
          'SELECT cod_disabled_province_codes FROM stores ORDER BY id LIMIT 1',
        )
        .first<{ cod_disabled_province_codes: string | null }>(),
      getOriginWarehouse(database),
    ]);

    return jsonOk({
      data: {
        couriers: courierResult.results ?? [],
        codDisabledProvinceCodes: parseProvinceCodeList(
          store?.cod_disabled_province_codes,
        ),
        originWarehouse: originWarehouse ?? undefined,
      },
    });
  } catch (error) {
    console.error('expeditions-list', error);
    return jsonError('Gagal memuat pengaturan ekspedisi.', 500);
  }
};

export const PATCH: APIRoute = async ({ locals, request }) => {
  const database = getDatabase(locals);
  if (!database) return jsonError('Database ekspedisi belum tersedia.', 500);

  const parsed = expeditionMutationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonError('Pengaturan ekspedisi tidak valid.', 400);
  }

  const body = parsed.data;
  if (!('courierId' in body)) {
    const validation = validateProvinceCodeList(
      body.codDisabledProvinceCodes,
    );
    if (!validation.success) {
      return jsonError('Kode provinsi kebijakan COD tidak valid.', 400);
    }

    try {
      const result = await database
        .prepare(`
          UPDATE stores
          SET cod_disabled_province_codes = ?
          WHERE id = (SELECT id FROM stores ORDER BY id LIMIT 1)
        `)
        .bind(validation.codes.join(','))
        .run();
      if (!result.meta?.changes) {
        return jsonError('Toko belum dikonfigurasi.', 400);
      }
      return jsonOk({
        message: 'Kebijakan wilayah COD berhasil disimpan.',
        data: { codDisabledProvinceCodes: validation.codes },
      });
    } catch (error) {
      console.error('expeditions-cod-policy-update', error);
      return jsonError('Gagal menyimpan kebijakan wilayah COD.', 500);
    }
  }

  const { courierId, field, value } = body;

  try {
    const column = field === 'enabled' ? 'is_enabled' : 'is_cod_enabled';
    const result = await database
      .prepare(`
        UPDATE courier_rules
        SET ${column} = ?
        WHERE id = ?
          AND store_id = (SELECT id FROM stores ORDER BY id LIMIT 1)
      `)
      .bind(value ? 1 : 0, courierId)
      .run();
    if (!result.meta?.changes) {
      return jsonError('Ekspedisi tidak ditemukan.', 400);
    }
    return jsonOk({
      message: `${
        field === 'enabled' ? 'Status layanan' : 'Status COD'
      } berhasil diperbarui.`,
    });
  } catch (error) {
    console.error('expeditions-update', error);
    return jsonError('Gagal memperbarui pengaturan ekspedisi.', 500);
  }
};

export const POST: APIRoute = async ({ locals, request }) => {
  const database = getDatabase(locals);
  if (!database) return jsonError('Database ekspedisi belum tersedia.', 500);

  const parsed = testRateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonError(
      'Tujuan harus dipilih dan berat harus berupa bilangan bulat antara 1 dan 1.000.000 gram.',
      400,
    );
  }

  const { destinationAreaId, weightGrams } = parsed.data;

  try {
    const [providerConfig, originWarehouse, courierResult] = await Promise.all([
      getProviderConfig(database, locals),
      getOriginWarehouse(database),
      listCourierRules(database),
    ]);
    const { apiKey, baseUrl } = providerConfig.mengantar;
    if (!apiKey) {
      return jsonError(
        'Mengantar API belum dikonfigurasi. Tambahkan API Key di pengaturan integrasi.',
        400,
      );
    }

    const originAreaId =
      originWarehouse?.originAreaId?.trim() ||
      getEnvValue('MENGANTAR_ORIGIN_AREA_ID', getRuntimeEnv(locals));
    if (!originAreaId) {
      return jsonError(
        'Area asal gudang belum dikonfigurasi. Lengkapi data gudang terlebih dahulu.',
        400,
      );
    }

    const providerRates = await new MengantarClient(
      apiKey,
      baseUrl,
    ).estimateRates({
      originId: originAreaId,
      destinationId: destinationAreaId,
      weight: weightGrams / 1_000,
      courier: 'all',
    });
    const courierRules = courierResult.results ?? [];
    const rates = providerRates.map((rate) => {
      const courierKey = rate.courier_code
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      const rule = courierRules.find(
        (candidate) =>
          candidate.courierCode
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '') === courierKey,
      );
      const isEnabled = rule?.isEnabled === 1;
      const isCodEnabled = rule?.isCodEnabled === 1;

      return {
        courierCode: rate.courier_code,
        courierName:
          COURIER_NAMES[courierKey] || rate.courier_code,
        serviceName: rate.courier_service || rate.courier_code,
        price: rate.price,
        estimatedDays: rate.estimated_days,
        isEnabled,
        isCodEnabled,
        codAvailable:
          isEnabled && isCodEnabled && !rate.unsupported_cod,
        codFee: rate.cod_fee,
      };
    });

    return jsonOk({
      message: rates.length
        ? 'Estimasi ongkir live berhasil dimuat.'
        : 'Mengantar tidak menemukan layanan untuk rute ini.',
      data: {
        destinationAreaId,
        weightGrams,
        originWarehouse: originWarehouse ?? undefined,
        rates,
      },
    });
  } catch (error) {
    console.error('expeditions-test-rate', error);
    const message =
      error instanceof Error && /timeout/i.test(error.message)
        ? 'Mengantar tidak merespons tepat waktu. Silakan coba lagi.'
        : 'Gagal mengambil estimasi ongkir live dari Mengantar.';
    return jsonError(message, 500);
  }
};
