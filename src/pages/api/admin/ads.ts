import type { APIRoute } from 'astro';
import { getEnvValue, getRuntimeEnv, maskSecretValue } from '../../../lib/env';
import { sendMetaCapiEvent, verifyMetaPixelIdentity } from '../../../lib/meta-capi';
import { countRecoverableEvents, drainCapiOutbox, requeueRecoverableEvents } from '../../../lib/capi-outbox';
import {
  GOOGLE_ADS_CONVERSION_ID_PATTERN,
  GOOGLE_ADS_CONVERSION_LABEL_PATTERN,
} from '../../../lib/store-ads';

export const prerender = false;

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const PIXEL_ID_PATTERN = /^\d{5,25}$/;
const GTM_ID_PATTERN = /^GTM-[A-Z0-9]{4,20}$/;
const META_TEST_CODE_PATTERN = /^TEST\d{3,20}$/;

type AdsConfigPayload = {
  action?: 'save-meta' | 'save-google' | 'test-capi' | 'requeue-capi';
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
    return json({
      success: true,
      data: {
        ...publicConfig(row, getEnvValue('META_CAPI_ACCESS_TOKEN', getRuntimeEnv(locals))),
        // Surfaced so the operator is told the outage is recoverable rather
        // than having to know to ask. Zero on a healthy store.
        capi_recoverable_events: await countRecoverableEvents(database).catch(() => 0),
      },
    });
  } catch (error) {
    console.error('ads-config-get', error);
    return json({ success: false, error: 'Gagal mengambil konfigurasi iklan & tracking.' }, 500);
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

    if (body.action === 'requeue-capi') {
      const pixelId = submittedPixelId || current.meta_pixel_id || '';
      if (!PIXEL_ID_PATTERN.test(pixelId) || !storedToken) {
        return json({ success: false, error: 'Simpan Pixel ID dan Access Token yang valid sebelum mengirim ulang.' }, 400);
      }
      // Proven live before anything is moved: requeueing against a token that
      // is still dead would re-terminate every row and spend the operator's
      // one recovery on nothing.
      const probe = await sendMetaCapiEvent(
        'PageView',
        `requeue_probe_${Date.now()}`,
        new URL(request.url).origin,
        {
          clientIp: request.headers.get('cf-connecting-ip') || '127.0.0.1',
          userAgent: request.headers.get('user-agent') || 'AdsBookCMS-CAPI-Tester/1.0',
        },
        {},
        pixelId,
        storedToken,
      ).catch(() => ({ success: false, reason: 'Koneksi ke Meta CAPI gagal.' }));
      if (!probe.success) {
        return json({ success: false, error: probe.reason || 'Meta menolak token saat ini; tidak ada event yang dikirim ulang.' }, 400);
      }
      const requeued = await requeueRecoverableEvents(database);
      const delivered = requeued ? await drainCapiOutbox(database, pixelId, storedToken) : 0;
      return json({
        success: true,
        message: requeued
          ? `${requeued} event dikirim ulang, ${delivered} sudah diterima Meta. Sisanya menunggu antrean.`
          : 'Tidak ada event gagal yang bisa dikirim ulang.',
        data: { requeued, delivered },
      });
    }

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

    let identityWarning: string | undefined;
    if (body.action === 'save-meta') {
      if (submittedPixelId && !PIXEL_ID_PATTERN.test(submittedPixelId)) return json({ success: false, error: 'Meta Pixel ID hanya boleh berisi 5–25 digit.' }, 400);
      // A digit check cannot tell a pixel from a Business Manager ID, and
      // saving the wrong one kills the browser Pixel and the Conversions API
      // together, silently, until someone reads Graph API error codes. Ask Meta
      // what the ID actually is while the operator is still on the screen.
      if (submittedPixelId && submittedPixelId !== current.meta_pixel_id && storedToken) {
        const identity = await verifyMetaPixelIdentity(submittedPixelId, storedToken);
        if (identity.state === 'not-a-pixel') {
          return json(
            {
              success: false,
              error:
                `ID ${submittedPixelId} ada di Meta${identity.name ? ` dengan nama "${identity.name}"` : ''}, ` +
                'tetapi bukan Pixel/Dataset — kemungkinan ID Business Manager, Page, atau Ad Account. ' +
                'Ambil Dataset ID dari Events Manager → Data Sources → Settings.',
            },
            400,
          );
        }
        if (identity.state === 'unknown') {
          // Never block on an inconclusive answer: a permission gap or a
          // network blip must not stop an operator saving a correct ID.
          identityWarning =
            `ID tersimpan, tetapi belum dapat dipastikan sebagai Pixel/Dataset (${identity.reason}). ` +
            'Jalankan "Kirim test event" untuk memastikan.';
        }
      }
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
      if (googleId && !GOOGLE_ADS_CONVERSION_ID_PATTERN.test(googleId)) return json({ success: false, error: 'Google Ads Conversion ID harus berformat AW-XXXXXXXXX.' }, 400);
      if (googleLabel && !GOOGLE_ADS_CONVERSION_LABEL_PATTERN.test(googleLabel)) return json({ success: false, error: 'Google Ads Conversion Label tidak valid.' }, 400);
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
      message: identityWarning ?? 'Konfigurasi tracking berhasil disimpan.',
      data: updated ? publicConfig(updated, getEnvValue('META_CAPI_ACCESS_TOKEN', getRuntimeEnv(locals))) : undefined,
    });
  } catch (error) {
    console.error('ads-config-put', error);
    return json({ success: false, error: 'Gagal memperbarui konfigurasi iklan & tracking.' }, 500);
  }
};
