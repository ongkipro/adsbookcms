import type { APIRoute } from 'astro';
import { getEnvValue, getRuntimeEnv, maskSecretValue } from '../../../lib/env';
import { sendMetaCapiEvent } from '../../../lib/meta-capi';

export const prerender = false;

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const PIXEL_ID_PATTERN = /^\d{5,25}$/;
const GOOGLE_ID_PATTERN = /^AW-\d{5,20}$/;
const GTM_ID_PATTERN = /^GTM-[A-Z0-9]{4,20}$/;
const META_TEST_CODE_PATTERN = /^TEST\d{3,20}$/;
const GOOGLE_LABEL_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

type AdsConfigPayload = {
  action?: 'save-meta' | 'save-google' | 'test-capi';
  meta_pixel_id?: string;
  meta_capi_token?: string;
  meta_test_event_code?: string;
  google_ads_conversion_id?: string;
  google_tag_manager_id?: string;
  google_ads_conversion_label?: string;
};

type AdsRow = {
  meta_pixel_id: string | null;
  meta_capi_token: string | null;
  google_tag_manager_id: string | null;
  google_ads_conversion_id: string | null;
  google_ads_conversion_label: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function getD1(locals: App.Locals) {
  const database = getRuntimeEnv(locals)?.OMS_DB;
  return database && typeof database === 'object' ? database as D1Database : null;
}

function clean(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

async function getAdsRow(database: D1Database) {
  return await database.prepare(`
    SELECT meta_pixel_id, meta_capi_token, google_tag_manager_id, google_ads_conversion_id, google_ads_conversion_label
    FROM stores
    ORDER BY id
    LIMIT 1
  `).first() as AdsRow | null;
}

function publicConfig(row: AdsRow, fallbackToken = '') {
  const effectiveToken = row.meta_capi_token || fallbackToken;
  return {
    meta_pixel_id: row.meta_pixel_id ?? '',
    meta_capi_configured: Boolean(effectiveToken),
    meta_capi_token_masked: maskSecretValue(effectiveToken),
    google_tag_manager_id: row.google_tag_manager_id ?? '',
    google_ads_conversion_id: row.google_ads_conversion_id ?? '',
    google_ads_conversion_label: row.google_ads_conversion_label ?? '',
  };
}

export const GET: APIRoute = async ({ locals }) => {
  const database = getD1(locals);
  if (!database) return json({ success: false, error: 'Database konfigurasi belum tersedia.' }, 503);

  try {
    const row = await getAdsRow(database);
    if (!row) return json({ success: false, error: 'Store belum tersedia.' }, 404);
    return json({ success: true, data: publicConfig(row, getEnvValue('META_CAPI_ACCESS_TOKEN', getRuntimeEnv(locals))) });
  } catch (error) {
    console.error('ads-config-get', error);
    return json({ success: false, error: 'Gagal mengambil konfigurasi Ads & Tracking.' }, 500);
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  const database = getD1(locals);
  if (!database) return json({ success: false, error: 'Database konfigurasi belum tersedia.' }, 503);

  const body = await request.json().catch(() => null) as AdsConfigPayload | null;
  if (!body) return json({ success: false, error: 'Payload tidak valid.' }, 400);

  try {
    const current = await getAdsRow(database);
    if (!current) return json({ success: false, error: 'Store belum tersedia.' }, 404);

    const submittedPixelId = clean(body.meta_pixel_id, 25);
    const submittedToken = clean(body.meta_capi_token, 4096);
    const testEventCode = clean(body.meta_test_event_code, 24).toUpperCase();
    const storedToken = submittedToken || current.meta_capi_token || getEnvValue('META_CAPI_ACCESS_TOKEN', getRuntimeEnv(locals));

    if (body.action === 'test-capi') {
      const pixelId = submittedPixelId || current.meta_pixel_id || '';
      if (!PIXEL_ID_PATTERN.test(pixelId)) return json({ success: false, error: 'Meta Pixel ID hanya boleh berisi 5–25 digit.' }, 400);
      if (!storedToken) return json({ success: false, error: 'Meta CAPI Access Token belum dikonfigurasi.' }, 400);
      if (!META_TEST_CODE_PATTERN.test(testEventCode)) return json({ success: false, error: 'Meta Test Event Code harus berformat TEST diikuti 3–20 digit.' }, 400);

      const result = await sendMetaCapiEvent(
        'PageView',
        `settings_test_${Date.now()}`,
        new URL(request.url).origin,
        {
          clientIp: request.headers.get('cf-connecting-ip') || '127.0.0.1',
          userAgent: request.headers.get('user-agent') || 'AdsBookCMS-CAPI-Tester/1.0',
        },
        { contentName: 'AdsBookCMS Meta CAPI connection test' },
        pixelId,
        storedToken,
        testEventCode,
      ).catch(() => ({ success: false, reason: 'Koneksi ke Meta CAPI gagal.' }));

      return json(
        {
          success: result.success,
          message: result.success ? 'Test event diterima Meta Conversions API.' : result.reason || 'Test event ditolak Meta Conversions API.',
        },
        result.success ? 200 : 400,
      );
    }

    if (body.action === 'save-meta') {
      if (submittedPixelId && !PIXEL_ID_PATTERN.test(submittedPixelId)) return json({ success: false, error: 'Meta Pixel ID hanya boleh berisi 5–25 digit.' }, 400);
      await database.prepare(`
        UPDATE stores
        SET meta_pixel_id = ?,
            meta_capi_token = CASE WHEN ? = '' THEN meta_capi_token ELSE ? END
        WHERE id = (SELECT id FROM stores ORDER BY id LIMIT 1)
      `).bind(submittedPixelId || null, submittedToken, submittedToken).run();
    } else if (body.action === 'save-google') {
      const googleTagManagerId = clean(body.google_tag_manager_id, 24).toUpperCase();
      const googleId = clean(body.google_ads_conversion_id, 24);
      const googleLabel = clean(body.google_ads_conversion_label, 100);
      if (Boolean(googleId) !== Boolean(googleLabel)) return json({ success: false, error: 'Conversion ID dan Label harus diisi berpasangan.' }, 400);
      if (googleTagManagerId && !GTM_ID_PATTERN.test(googleTagManagerId)) return json({ success: false, error: 'Google Tag Manager ID harus berformat GTM-XXXXXXX.' }, 400);
      if (googleId && !GOOGLE_ID_PATTERN.test(googleId)) return json({ success: false, error: 'Google Ads Conversion ID harus berformat AW-XXXXXXXXX.' }, 400);
      if (googleLabel && !GOOGLE_LABEL_PATTERN.test(googleLabel)) return json({ success: false, error: 'Google Ads Conversion Label tidak valid.' }, 400);
      await database.prepare(`
        UPDATE stores
        SET google_tag_manager_id = ?, google_ads_conversion_id = ?, google_ads_conversion_label = ?
        WHERE id = (SELECT id FROM stores ORDER BY id LIMIT 1)
      `).bind(googleTagManagerId || null, googleId || null, googleLabel || null).run();
    } else {
      return json({ success: false, error: 'Action tidak dikenal.' }, 400);
    }

    const updated = await getAdsRow(database);
    return json({
      success: true,
      message: 'Konfigurasi tracking berhasil disimpan.',
      data: updated ? publicConfig(updated, getEnvValue('META_CAPI_ACCESS_TOKEN', getRuntimeEnv(locals))) : undefined,
    });
  } catch (error) {
    console.error('ads-config-put', error);
    return json({ success: false, error: 'Gagal memperbarui konfigurasi Ads & Tracking.' }, 500);
  }
};
