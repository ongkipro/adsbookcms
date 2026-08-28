import type { APIRoute } from 'astro';
import { handleOptions, headlessError, headlessOk, validateHeadlessRequest } from '../../../../lib/headless-api';
import { validateMetaEventPayload } from '../../../../lib/meta-event-contract';
import { getStoreAdsConfig } from '../../../../lib/store-ads';
import { getRuntimeEnv } from '../../../../lib/env';
import { getClientIp } from '../../../../lib/rate-limit';
import { enqueueCapiEvent, deliverCapiEvent, drainCapiOutbox } from '../../../../lib/capi-outbox';
import { findPurchaseOrderForApiKeyCaller } from '../../../../lib/meta-purchase-order';
import { toE164Digits } from '../../../../lib/meta-capi';
import { matchableCustomerEmail } from '../../../../lib/autolaris-payment';

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

    // A Purchase resolves to a server-known order, exactly as the first-party
    // route does. This used to take the caller's word for both the event id and
    // the revenue, and `sendMetaCapiEvent` then refused every one of them:
    // `resolveMetaEventId` substitutes `customData.orderNumber` for a Purchase,
    // nothing here ever set it, so the event was enqueued, failed delivery
    // without a single HTTP call to Meta, burned its five retries and ended
    // `failed` — while this route had already answered `200 { queued: true }`.
    // A headless storefront's entire Purchase signal was silently discarded.
    let purchaseOrder = null;
    if (payload.eventName === 'Purchase') {
      // The contract keys the Purchase event id on the order number, so the
      // event id is the locator. STOREFRONT_INTEGRATION §4.8 states it and the
      // browser leg obeys it; this is where the server checks it is true.
      purchaseOrder = await findPurchaseOrderForApiKeyCaller(database, payload.eventId);
      if (!purchaseOrder) {
        return validation.finalize(headlessError(
          'Purchase event_id harus berupa order_number yang tercatat.',
          404,
          { code: 'PURCHASE_ORDER_NOT_FOUND' },
          validation.corsHeaders,
        ));
      }
    }

    const eventId = purchaseOrder?.order_number || payload.eventId;
    const event = {
      eventName: payload.eventName,
      eventId,
      eventSourceUrl: payload.eventSourceUrl,
      userData: {
        phone: purchaseOrder?.customer_phone || payload.phone,
        name: purchaseOrder?.customer_name || payload.name,
        // See `/api/meta-event`: a minted provider address is not a match key.
        email:
          matchableCustomerEmail(
            purchaseOrder?.customer_email,
            locals.tenant.siteUrl,
            request.url,
          ) ||
          payload.email,
        city: purchaseOrder?.city || payload.city,
        province: purchaseOrder?.province || payload.province,
        postalCode: purchaseOrder?.postal_code || payload.postalCode,
        country: payload.country,
        externalId:
          payload.externalId ||
          (purchaseOrder ? toE164Digits(purchaseOrder.customer_phone) : undefined),
        fbp: payload.fbp,
        fbc: payload.fbc,
        clientIp: getClientIp(request.headers),
        userAgent: request.headers.get('user-agent') || '',
      },
      customData: {
        contentName: payload.contentName,
        contentIds: payload.contentIds,
        // The goods, not the invoice, and read from D1 rather than from the
        // caller — the two legs of one Purchase must not disagree on revenue.
        value: purchaseOrder?.product_value ?? payload.value,
        currency: payload.currency,
        orderNumber: purchaseOrder?.order_number,
      },
    };

    const queued = await enqueueCapiEvent(database, event);
    if (!queued) {
      return validation.finalize(headlessOk(
        {
          deduplicated: true,
          event_id: eventId,
        },
        200,
        validation.corsHeaders
      ));
    }

    const delivered = await deliverCapiEvent(
      database,
      eventId,
      adsConfig.metaPixelId,
      adsConfig.metaCapiToken
    );

    const drain = drainCapiOutbox(database, adsConfig.metaPixelId, adsConfig.metaCapiToken)
      .catch((err) => console.error('headless-tracking-drain-error', err));
    if (locals.cfContext) locals.cfContext.waitUntil(drain);
    else void drain;

    return validation.finalize(headlessOk(
      {
        event_id: eventId,
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
