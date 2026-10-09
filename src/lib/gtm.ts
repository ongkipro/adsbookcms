export type GtmEcomPayload = {
  currency?: string;
  value?: number;
  /** Unit price. Derived from `value / quantity` when omitted. */
  price?: number;
  quantity?: number;
  item_id?: string;
  item_name?: string;
  item_variant?: string;
  transaction_id?: string;
  event_id?: string;
};

declare global {
  interface Window {
    dataLayer?: Record<string, any>[];
    __PS_PUSH_GTM_ECOM__?: (event: string, payload: GtmEcomPayload) => void;
  }
}

export function pushDataLayer(event: Record<string, any>) {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(event);
}

/**
 * The one GA4 ecommerce shape every app event is pushed in. `GtmBase.astro`
 * carries an inline copy for `is:inline` callers, which cannot import this;
 * `gtm.test.ts` runs that copy and fails if the two disagree.
 *
 * `value` stays the caller's total (the server's figure on a Purchase) and the
 * item's `price` is the unit price, so `price * quantity` adds back up to it.
 */
export function buildGtmEcomEvent(event: string, payload: GtmEcomPayload = {}) {
  const quantity = Math.max(1, Math.floor(Number(payload.quantity) || 1));
  const value = Number(payload.value || 0);
  const price = payload.price === undefined ? value / quantity : Number(payload.price || 0);
  return {
    event,
    tracking_owner: 'app',
    meta_managed_by_app: true,
    meta_event_id: payload.event_id,
    ecommerce: {
      currency: payload.currency || 'IDR',
      value,
      transaction_id: payload.transaction_id,
      items: [
        {
          item_id: payload.item_id || '',
          item_name: payload.item_name || '',
          item_variant: payload.item_variant || undefined,
          price,
          quantity,
        },
      ],
    },
  };
}

export function pushGtmEcomEvent(event: string, payload: GtmEcomPayload) {
  if (typeof window === 'undefined') return;
  if (typeof window.__PS_PUSH_GTM_ECOM__ === 'function') {
    window.__PS_PUSH_GTM_ECOM__(event, payload);
    return;
  }
  pushDataLayer({ ecommerce: null });
  pushDataLayer(buildGtmEcomEvent(event, payload));
}
