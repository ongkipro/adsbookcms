export const META_EVENT_NAMES = [
  'PageView',
  'ViewContent',
  'AddToCart',
  'InitiateCheckout',
  'Purchase',
] as const;

export type MetaEventName = (typeof META_EVENT_NAMES)[number];

export type ValidMetaEvent = {
  eventName: MetaEventName;
  eventId: string;
  eventSourceUrl: string;
  phone?: string;
  name?: string;
  email?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  externalId?: string;
  // _fbp/_fbc are Meta's own cookies: forwarded raw, never hashed.
  fbp?: string;
  fbc?: string;
  contentName?: string;
  contentIds?: string[];
  value?: number;
  currency: 'IDR';
};

type ValidationResult =
  | { ok: true; value: ValidMetaEvent }
  | { ok: false; error: string };

const EVENT_NAMES = new Set<string>(META_EVENT_NAMES);
const EVENT_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;
// Product ID, Meta content_id, Google item_id and both feed g:id values share
// this exact decimal identity. Leading zeroes are rejected because they are not
// the D1 integer Product ID the admin displays.
const PRODUCT_ID_PATTERN = /^[1-9]\d{4,15}$/;
// fb.<subdomainIndex>.<timestamp>.<payload>
const FB_COOKIE_PATTERN = /^fb\.\d\.\d{10,20}\..+$/;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function optionalString(value: unknown, maxLength: number): string | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

export function validateMetaEventPayload(
  input: unknown,
  requestUrl: string,
  allowedSourceOrigin?: string | null,
): ValidationResult {
  const payload = record(input);
  if (!payload) return { ok: false, error: 'Payload Meta harus berupa object JSON.' };

  if (typeof payload.event_name !== 'string' || !EVENT_NAMES.has(payload.event_name)) {
    return { ok: false, error: 'Meta event_name tidak didukung.' };
  }
  if (typeof payload.event_id !== 'string' || !EVENT_ID_PATTERN.test(payload.event_id)) {
    return { ok: false, error: 'Meta event_id tidak valid.' };
  }

  let eventSourceUrl: URL;
  const currentUrl = new URL(requestUrl);
  try {
    eventSourceUrl = new URL(
      typeof payload.event_source_url === 'string' && payload.event_source_url
        ? payload.event_source_url
        : currentUrl.origin,
      currentUrl,
    );
  } catch {
    return { ok: false, error: 'Meta event_source_url tidak valid.' };
  }
  const sourceMatchesApi = eventSourceUrl.origin === currentUrl.origin;
  const sourceMatchesAllowedStorefront =
    typeof allowedSourceOrigin === 'string' &&
    eventSourceUrl.origin === allowedSourceOrigin;
  if (!sourceMatchesApi && !sourceMatchesAllowedStorefront) {
    return { ok: false, error: 'Meta event_source_url harus berasal dari storefront yang diizinkan.' };
  }

  const userData = payload.user_data === undefined ? null : record(payload.user_data);
  if (payload.user_data !== undefined && !userData) {
    return { ok: false, error: 'Meta user_data tidak valid.' };
  }
  // The storefront trackers send customer_* keys; accept the Meta-native keys too.
  const phone = optionalString(userData?.phone ?? userData?.customer_phone, 32);
  const name = optionalString(userData?.name ?? userData?.customer_name, 160);
  const email = optionalString(userData?.email ?? userData?.customer_email, 160);
  const city = optionalString(userData?.city, 120);
  const province = optionalString(userData?.province ?? userData?.state, 120);
  const postalCode = optionalString(userData?.postal_code, 16);
  const country = optionalString(userData?.country, 8);
  const externalId = optionalString(userData?.external_id, 128);
  if (
    phone === null || name === null || email === null || city === null ||
    province === null || postalCode === null || country === null || externalId === null
  ) {
    return { ok: false, error: 'Meta customer data tidak valid atau terlalu panjang.' };
  }
  const fbp = optionalString(userData?.fbp, 128);
  const fbc = optionalString(userData?.fbc, 512);
  if (fbp === null || fbc === null) {
    return { ok: false, error: 'Meta browser cookie tidak valid.' };
  }

  const customData = payload.custom_data === undefined ? null : record(payload.custom_data);
  if (payload.custom_data !== undefined && !customData) {
    return { ok: false, error: 'Meta custom_data tidak valid.' };
  }
  // Trackers post commerce fields flat; `custom_data` stays supported for callers
  // that follow the Meta payload shape verbatim. Reading only the nested shape is
  // what previously sent Meta an event with no value and no catalog id at all.
  const commerce = customData ?? payload;

  const contentName = optionalString(commerce.content_name, 200);
  if (contentName === null) return { ok: false, error: 'Meta content_name tidak valid.' };

  const rawContentIds = commerce.content_ids ?? (commerce.product_id === undefined ? undefined : [commerce.product_id]);
  let contentIds: string[] | undefined;
  if (rawContentIds !== undefined) {
    if (
      !Array.isArray(rawContentIds) ||
      rawContentIds.length === 0 ||
      rawContentIds.length > 20 ||
      rawContentIds.some((id) => typeof id !== 'string' || !PRODUCT_ID_PATTERN.test(id))
    ) {
      return { ok: false, error: 'Meta content_ids harus berisi maksimal 20 ID produk katalog.' };
    }
    contentIds = rawContentIds as string[];
  }

  let value: number | undefined;
  if (commerce.value !== undefined) {
    if (typeof commerce.value !== 'number' || !Number.isFinite(commerce.value) || commerce.value < 0 || commerce.value > 1_000_000_000_000) {
      return { ok: false, error: 'Meta conversion value tidak valid.' };
    }
    value = commerce.value;
  }
  if (commerce.currency !== undefined && commerce.currency !== 'IDR') {
    return { ok: false, error: 'Meta currency harus IDR.' };
  }

  return {
    ok: true,
    value: {
      eventName: payload.event_name as MetaEventName,
      eventId: payload.event_id,
      eventSourceUrl: `${eventSourceUrl.origin}${eventSourceUrl.pathname}`,
      phone,
      name,
      email,
      city,
      province,
      postalCode,
      country,
      externalId,
      fbp: fbp && FB_COOKIE_PATTERN.test(fbp) ? fbp : undefined,
      fbc: fbc && FB_COOKIE_PATTERN.test(fbc) ? fbc : undefined,
      contentName,
      contentIds,
      value,
      currency: 'IDR',
    },
  };
}
