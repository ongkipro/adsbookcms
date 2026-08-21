import { metaNameParts, normalizeMetaText, toE164Digits } from './meta-identity.ts';
/**
 * Pinned in one place so a bump is a one-line change, never a grep across
 * trackers. Meta ships a version roughly quarterly and retires each after about
 * two years — re-check the changelog before bumping, do not guess:
 * https://developers.facebook.com/docs/graph-api/changelog
 *
 * Verified current on 2026-08-14 (v26.0, released 2026-07-29).
 */
export const META_GRAPH_API_VERSION = 'v26.0';

export { toE164Digits } from './meta-identity.ts';

export type MetaUserData = {
  phone?: string;
  name?: string;
  email?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  externalId?: string;
  /** Meta's own cookies. Forwarded raw — hashing them breaks matching. */
  fbp?: string;
  fbc?: string;
  clientIp?: string;
  userAgent?: string;
};

export type MetaCustomData = {
  contentName?: string;
  contentIds?: string[];
  contentType?: string;
  value?: number;
  currency?: string;
  /** Canonical order number. Required for Purchase event deduplication. */
  orderNumber?: string;
};

async function sha256(value: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Meta matches on lowercased, punctuation-free text. */
function hashText(value?: string) {
  const cleaned = normalizeMetaText(value);
  return cleaned ? sha256(cleaned) : undefined;
}

function hashEmail(value?: string) {
  const cleaned = value?.trim().toLowerCase();
  return cleaned ? sha256(cleaned) : undefined;
}

function hashPhone(value?: string) {
  const digits = toE164Digits(value);
  return digits ? sha256(digits) : undefined;
}

function hashFirstName(value?: string) {
  const { firstName } = metaNameParts(value);
  return firstName ? sha256(firstName) : undefined;
}

function hashLastName(value?: string) {
  const { lastName } = metaNameParts(value);
  return lastName ? sha256(lastName) : undefined;
}

function cleanRawSignal(value?: string): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

function cleanClientIp(value?: string): string | undefined {
  const cleaned = cleanRawSignal(value);
  return cleaned?.toLowerCase() === 'unknown' ? undefined : cleaned;
}

export function resolveMetaEventId(
  eventName: string,
  eventId: string,
  orderNumber?: string,
): string | undefined {
  const resolved = eventName === 'Purchase' ? orderNumber : eventId;
  return cleanRawSignal(resolved);
}

function readMetaErrorMessage(responseBody: unknown): string | undefined {
  if (!responseBody || typeof responseBody !== 'object' || !('error' in responseBody)) return undefined;
  const error = responseBody.error;
  if (!error || typeof error !== 'object' || !('message' in error)) return undefined;
  return typeof error.message === 'string' && error.message.trim() ? error.message : undefined;
}

export async function sendMetaCapiEvent(
  eventName: string,
  eventId: string,
  eventSourceUrl: string,
  userData: MetaUserData,
  customData: MetaCustomData,
  pixelId?: string,
  accessToken?: string,
  testEventCode?: string,
): Promise<{
  success: boolean;
  response?: unknown;
  reason?: string;
}> {
  const resolvedEventId = resolveMetaEventId(eventName, eventId, customData.orderNumber);
  if (!resolvedEventId) {
    return {
      success: false,
      reason: eventName === 'Purchase'
        ? 'Purchase membutuhkan order_number sebagai event_id.'
        : 'Meta event_id tidak boleh kosong.',
    };
  }

  const clientIp = cleanClientIp(userData.clientIp);
  const userAgent = cleanRawSignal(userData.userAgent);
  const fbp = cleanRawSignal(userData.fbp);
  const fbc = cleanRawSignal(userData.fbc);
  const orderNumber = cleanRawSignal(customData.orderNumber);
  const targetPixelId = pixelId || import.meta.env.META_PIXEL_ID;
  const targetToken = accessToken || import.meta.env.META_CAPI_ACCESS_TOKEN;

  if (!targetPixelId || !targetToken) {
    return { success: false, reason: 'META_PIXEL_ID or META_CAPI_ACCESS_TOKEN not set' };
  }

  const [ph, em, fn, ln, ct, st, zp, country, external_id] = await Promise.all([
    hashPhone(userData.phone),
    hashEmail(userData.email),
    hashFirstName(userData.name),
    hashLastName(userData.name),
    hashText(userData.city),
    hashText(userData.province),
    hashText(userData.postalCode),
    hashText(userData.country),
    hashText(userData.externalId),
  ]);

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: resolvedEventId,
        event_source_url: eventSourceUrl,
        action_source: 'website',
        user_data: {
          ph: ph ? [ph] : undefined,
          em: em ? [em] : undefined,
          fn: fn ? [fn] : undefined,
          ln: ln ? [ln] : undefined,
          ct: ct ? [ct] : undefined,
          st: st ? [st] : undefined,
          zp: zp ? [zp] : undefined,
          country: country ? [country] : undefined,
          external_id: external_id ? [external_id] : undefined,
          fbp,
          fbc,
          client_ip_address: clientIp,
          client_user_agent: userAgent,
        },
        custom_data: {
          content_name: customData.contentName,
          content_ids: customData.contentIds,
          content_type: customData.contentType || 'product',
          value: customData.value,
          currency: customData.currency || 'IDR',
          order_id: orderNumber,
        },
      },
    ],
    test_event_code: testEventCode || undefined,
  };

  const endpoint = `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${targetPixelId}/events?access_token=${targetToken}`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const responseBody: unknown = await response.json().catch(() => null);
    const errorMessage = readMetaErrorMessage(responseBody);
    return {
      success: response.ok,
      response: responseBody,
      reason: response.ok
        ? undefined
        : errorMessage || `Meta CAPI HTTP ${response.status}.`,
    };
  } catch (error) {
    return {
      success: false,
      reason: error instanceof Error ? error.message : 'Meta CAPI network error.',
    };
  }
}
