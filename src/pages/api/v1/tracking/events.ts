import type { APIRoute } from 'astro';
import { handleOptions, headlessError, headlessOk, validateHeadlessRequest } from '../../../../lib/headless-api';
import { validateMetaEventPayload } from '../../../../lib/meta-event-contract';
import { getStoreAdsConfig } from '../../../../lib/store-ads';
import { getRuntimeEnv } from '../../../../lib/env';
import { getClientIp } from '../../../../lib/rate-limit';
import { enqueueCapiEvent, deliverCapiEvent, drainCapiOutbox } from '../../../../lib/capi-outbox';

export const prerender = false;

export const OPTIONS = handleOptions;

export const POST: APIRoute = async ({ request, locals }) => {
  const validation = await validateHeadlessRequest(request, locals, { operation: 'trackingCreate' });
  if (!validation.allowed) {
    return validation.errorResponse;
  }

  try {
    const rawPayload = await request.json().catch(() => null);
    const validated = validateMetaEventPayload(rawPayload, request.url, validation.origin);
    if (!validated.ok) {
      return validation.finalize(headlessError(validated.error, 400, {
        code: 'INVALID_TRACKING_PAYLOAD',
      }, validation.corsHeaders));
    }

    const payload = validated.value;
    const adsConfig = await getStoreAdsConfig(locals);
    if (!adsConfig.metaPixelId || !adsConfig.metaCapiToken) {
      return validation.finalize(headlessOk(
        {
          skipped: true,
          reason: 'Tracking pixel/CAPI belum dikonfigurasi untuk toko ini.',
        },
        200,
        validation.corsHeaders
      ));
    }

    const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
    if (!database?.prepare) {
      return validation.finalize(headlessError('Database tracking event store belum dikonfigurasi.', 503, {
        code: 'DATABASE_UNAVAILABLE',
      }, validation.corsHeaders));
    }

    const event = {
      eventName: payload.eventName,
      eventId: payload.eventId,
      eventSourceUrl: payload.eventSourceUrl,
      userData: {
        phone: payload.phone,
        name: payload.name,
        email: payload.email,
        city: payload.city,
        province: payload.province,
        postalCode: payload.postalCode,
        country: payload.country,
        externalId: payload.externalId,
        fbp: payload.fbp,
        fbc: payload.fbc,
        clientIp: getClientIp(request.headers),
        userAgent: request.headers.get('user-agent') || '',
      },
      customData: {
        contentName: payload.contentName,
        contentIds: payload.contentIds,
        value: payload.value,
        currency: payload.currency,
      },
    };

    const queued = await enqueueCapiEvent(database, event);
    if (!queued) {
      return validation.finalize(headlessOk(
        {
          deduplicated: true,
          event_id: payload.eventId,
        },
        200,
        validation.corsHeaders
      ));
    }

    const delivered = await deliverCapiEvent(
      database,
      payload.eventId,
      adsConfig.metaPixelId,
      adsConfig.metaCapiToken
    );

    const drain = drainCapiOutbox(database, adsConfig.metaPixelId, adsConfig.metaCapiToken)
      .catch((err) => console.error('headless-tracking-drain-error', err));
    if (locals.cfContext) locals.cfContext.waitUntil(drain);
    else void drain;

    return validation.finalize(headlessOk(
      {
        event_id: payload.eventId,
        event_name: payload.eventName,
        delivered,
        queued: !delivered,
      },
      200,
      validation.corsHeaders
    ));
  } catch (error) {
    return validation.finalize(headlessError('Gagal memproses tracking signal event.', 500, {
      code: 'TRACKING_SIGNAL_ERROR',
      details: error instanceof Error ? error.message : String(error),
    }, validation.corsHeaders));
  }
};
