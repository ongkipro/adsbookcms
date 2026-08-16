import type { APIRoute } from 'astro';
import { drainCapiOutbox, deliverCapiEvent, enqueueCapiEvent } from '../../lib/capi-outbox';
import { getStoreAdsConfig } from '../../lib/store-ads';
import { validateMetaEventPayload } from '../../lib/meta-event-contract';
import { getRuntimeEnv } from '../../lib/env';
import { toE164Digits } from '../../lib/meta-capi';
import { getClientIp } from '../../lib/rate-limit';

export const prerender = false;

const json = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

type PurchaseOrderRow = {
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  province: string;
  city: string;
  postal_code: string | null;
  total_amount: number;
};

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

async function findPurchaseOrder(
  database: D1Database,
  reference: PurchaseReference & { statusToken: string },
): Promise<PurchaseOrderRow | null> {
  return database
    .prepare(
      `SELECT
         order_number, customer_name, customer_phone, customer_email,
         province, city, postal_code, total_amount
       FROM orders
       WHERE (CAST(id AS TEXT) = ? OR order_number = ?)
         AND public_status_token = ?
       LIMIT 1`,
    )
    .bind(reference.orderLocator, reference.orderLocator, reference.statusToken)
    .first<PurchaseOrderRow>();
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
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
    const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
    if (!database?.prepare) {
      return json({ success: false, error: 'Event store belum tersedia.' }, 503);
    }

    let purchaseOrder: PurchaseOrderRow | null = null;
    let purchaseOrderNumber: string | undefined;
    if (payload.eventName === 'Purchase') {
      const reference = getPurchaseReference(rawPayload, payload.eventSourceUrl);
      if (!reference || !reference.statusToken) {
        return json(
          { success: false, error: 'Purchase membutuhkan order_number dan status_token.' },
          400,
        );
      }
      purchaseOrder = await findPurchaseOrder(database, {
        orderLocator: reference.orderLocator,
        statusToken: reference.statusToken,
      });
      if (!purchaseOrder) {
        return json({ success: false, error: 'Order Purchase tidak ditemukan atau token tidak valid.' }, 404);
      }
      purchaseOrderNumber = purchaseOrder.order_number;
    }

    const eventId = purchaseOrderNumber || payload.eventId;
    const purchaseExternalId = purchaseOrder
      ? toE164Digits(purchaseOrder.customer_phone)
      : undefined;
    const event = {
      eventName: payload.eventName,
      eventId,
      eventSourceUrl: payload.eventSourceUrl,
      userData: {
        phone: purchaseOrder?.customer_phone || payload.phone,
        name: purchaseOrder?.customer_name || payload.name,
        email: purchaseOrder?.customer_email || payload.email,
        city: purchaseOrder?.city || payload.city,
        province: purchaseOrder?.province || payload.province,
        postalCode: purchaseOrder?.postal_code || payload.postalCode,
        externalId: purchaseExternalId || payload.externalId,
        fbp: payload.fbp,
        fbc: payload.fbc,
        clientIp: getClientIp(request.headers),
        userAgent: request.headers.get('user-agent') || undefined,
      },
      customData: {
        contentName: payload.contentName,
        contentIds: payload.contentIds,
        value: purchaseOrder?.total_amount ?? payload.value,
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
