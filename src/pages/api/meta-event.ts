import type { APIRoute } from 'astro';
import { drainCapiOutbox, deliverCapiEvent, enqueueCapiEvent } from '../../lib/capi-outbox';
import { getStoreAdsConfig } from '../../lib/store-ads';
import { validateMetaEventPayload } from '../../lib/meta-event-contract';
import { getRuntimeEnv } from '../../lib/env';
import { toE164Digits } from '../../lib/meta-capi';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '../../lib/rate-limit';
import { readMetaBrowserIds } from '../../lib/click-ids';
import { resolveMetaCountry } from '../../lib/meta-identity';
import { matchableCustomerEmail } from '../../lib/autolaris-payment';
import {
  findPurchaseOrderByStatusToken,
  isMetaPurchaseOrderEligible,
  resolveMetaPurchaseContentIds,
  type MetaPurchaseOrder,
} from '../../lib/meta-purchase-order';

export const prerender = false;

const json = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

type PurchaseReference = {
  orderLocator: string;
  statusToken?: string;
};


function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getPurchaseReference(
  rawPayload: unknown,
  eventSourceUrl: string,
): PurchaseReference | null {
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return null;
  const customData = 'custom_data' in rawPayload ? rawPayload.custom_data : undefined;
  const customOrderNumber =
    customData && typeof customData === 'object' && 'order_number' in customData
      ? trimmedString(customData.order_number)
      : '';
  const customOrderId =
    customData && typeof customData === 'object' && 'order_id' in customData
      ? trimmedString(customData.order_id)
      : '';
  const customStatusToken =
    customData && typeof customData === 'object' && 'status_token' in customData
      ? trimmedString(customData.status_token)
      : '';
  const sourceUrl = new URL(eventSourceUrl);
  const orderLocator =
    ('order_number' in rawPayload ? trimmedString(rawPayload.order_number) : '') ||
    customOrderNumber ||
    ('order_id' in rawPayload ? trimmedString(rawPayload.order_id) : '') ||
    ('order_pk' in rawPayload ? trimmedString(rawPayload.order_pk) : '') ||
    customOrderId ||
    sourceUrl.searchParams.get('order_number')?.trim() ||
    sourceUrl.searchParams.get('order_id')?.trim() ||
    sourceUrl.searchParams.get('order_pk')?.trim() ||
    '';
  const statusToken =
    ('status_token' in rawPayload ? trimmedString(rawPayload.status_token) : '') ||
    customStatusToken ||
    sourceUrl.searchParams.get('status_token')?.trim() ||
    '';
  return orderLocator ? { orderLocator, statusToken: statusToken || undefined } : null;
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // The only public POST in this repository that carried no rate limit, and
    // the one with the most to spend: each accepted event inserts a row into
    // `capi_event_outbox` — which nothing prunes — and then makes a real call
    // to graph.facebook.com, with `drainCapiOutbox` free to make ten more.
    //
    // `event_id` deduplication stops a *replay*, not a flood: an attacker
    // minting fresh ids is never deduplicated. The cost is not only D1 rows
    // and Worker subrequests. Purchase is safe — it must resolve to an order
    // and its status token — but `PageView` and `ViewContent` are not, so
    // fabricated funnel events could be injected into a merchant's pixel and
    // quietly degrade the optimisation data they are paying Meta to learn
    // from, while burning the CAPI quota real conversions need.
    //
    // 60/minute per IP, the same ceiling `/api/shipping-rates` uses. A real
    // session fires a handful of events per page; this bites only a machine.
    const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
    const clientIp = getClientIp(request.headers);
    const rateLimit = await checkRateLimit(database, `public-meta-event:${clientIp}`, 60, 60_000);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ success: false, error: 'Terlalu banyak event. Coba lagi sebentar.', code: 'RATE_LIMITED' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            ...rateLimitHeaders(rateLimit.remaining, rateLimit.resetAt),
          },
        },
      );
    }

    const rawPayload = await request.json().catch(() => null);
    const validated = validateMetaEventPayload(rawPayload, request.url);
    if (validated.ok === false) return json({ success: false, error: validated.error }, 400);
    const payload = validated.value;

    const adsConfig = await getStoreAdsConfig(locals);
    if (!adsConfig.metaPixelId || !adsConfig.metaCapiToken) {
      return json(
        { success: true, skipped: true, reason: 'Meta CAPI is not configured for this store.' },
        202,
      );
    }
    if (!database?.prepare) {
      return json({ success: false, error: 'Event store belum tersedia.' }, 503);
    }

    let purchaseOrder: MetaPurchaseOrder | null = null;
    let purchaseOrderNumber: string | undefined;
    if (payload.eventName === 'Purchase') {
      const reference = getPurchaseReference(rawPayload, payload.eventSourceUrl);
      if (!reference || !reference.statusToken) {
        return json(
          { success: false, error: 'Purchase membutuhkan order_number dan status_token.' },
          400,
        );
      }
      purchaseOrder = await findPurchaseOrderByStatusToken(
        database,
        reference.orderLocator,
        reference.statusToken,
      );
      if (!purchaseOrder) {
        return json({ success: false, error: 'Order Purchase tidak ditemukan atau token tidak valid.' }, 404);
      }
      if (!isMetaPurchaseOrderEligible(purchaseOrder)) {
        return json({ success: false, error: 'Order belum memenuhi syarat Purchase.' }, 409);
      }
      purchaseOrderNumber = purchaseOrder.order_number;
    }

    const eventId = purchaseOrderNumber || payload.eventId;
    const purchaseExternalId = purchaseOrder
      ? toE164Digits(purchaseOrder.customer_phone)
      : undefined;
    // The request carries all three first-party browser identifiers on its own.
    // Reading them here gives PageView and ViewContent the stable advertiser ID
    // and Meta's fbp/fbc even though those trackers send no user_data. Explicit
    // values still win for fbp/fbc because the Pixel's own copy is authoritative;
    // the dedicated external ID cookie wins over phone so every funnel event for
    // one visitor keeps the same advertiser-issued identity.
    const browserIds = readMetaBrowserIds(request);
    const event = {
      eventName: payload.eventName,
      eventId,
      eventSourceUrl: payload.eventSourceUrl,
      userData: {
        phone: purchaseOrder?.customer_phone || payload.phone,
        name: purchaseOrder?.customer_name || payload.name,
        // Never the address `buyerEmail`/`submit-order` mint for the payment
        // provider: it is `<phone digits>@<store host>`, nobody owns it, and Meta
        // scores match quality on every key it is handed.
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
        // Truthful without guessing: a resolved order is Indonesian by
        // construction, and every other event falls back to the country
        // Cloudflare resolved for this very request.
        country: resolveMetaCountry(
          payload.country,
          request.headers.get('cf-ipcountry'),
          Boolean(purchaseOrder),
        ),
        externalId:
          browserIds.externalId || purchaseExternalId || payload.externalId,
        fbp: payload.fbp || browserIds.fbp,
        fbc: payload.fbc || browserIds.fbc,
        clientIp: getClientIp(request.headers),
        userAgent: request.headers.get('user-agent') || undefined,
      },
      customData: {
        contentName: payload.contentName,
        contentIds: resolveMetaPurchaseContentIds(purchaseOrder, payload.contentIds),
        // The goods, not the invoice — the same figure the browser leg sends,
        // read the same way, so the two legs of one Purchase never disagree on
        // revenue. Shipping, the COD service fee and its VAT, and the payment
        // channel's admin fee are all excluded: none is product revenue.
        value: purchaseOrder?.product_value ?? payload.value,
        currency: payload.currency,
        orderNumber: purchaseOrderNumber,
      },
    };

    // Record before transmitting: a failed send becomes a retry, never a lost
    // conversion. A repeated event_id is already accounted for.
    const queued = await enqueueCapiEvent(database, event);
    if (!queued) return json({ success: true, deduplicated: true }, 200);

    const delivered = await deliverCapiEvent(
      database,
      event.eventName,
      eventId,
      adsConfig.metaPixelId,
      adsConfig.metaCapiToken,
    );

    // Retry earlier failures on the back of live traffic, after the response.
    const drain = drainCapiOutbox(database, adsConfig.metaPixelId, adsConfig.metaCapiToken)
      .catch((error) => console.error('capi-outbox-drain', error));
    if (locals.cfContext) locals.cfContext.waitUntil(drain);
    else void drain;

    // Queued-but-undelivered is still success for the caller: the event is
    // durably held and will be retried.
    return json({ success: true, delivered, queued: !delivered }, 200);
  } catch (error) {
    console.error('meta-event', error);
    return json({ success: false, error: 'Meta event trigger error' }, 500);
  }
};
