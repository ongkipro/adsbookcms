export type GtmEcomPayload = {
  currency?: string;
  value?: number;
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

function fallbackPushGtmEcomEvent(event: string, payload: GtmEcomPayload) {
  pushDataLayer({ ecommerce: null });
  pushDataLayer({
    event,
    tracking_owner: 'app',
    meta_managed_by_app: true,
    meta_event_id: payload.event_id,
    ecommerce: {
      currency: payload.currency || 'IDR',
      value: Number(payload.value || 0),
      transaction_id: payload.transaction_id,
      items: [
        {
          item_id: payload.item_id || '',
          item_name: payload.item_name || '',
          item_variant: payload.item_variant || undefined,
          quantity: 1,
        },
      ],
    },
  });
}

export function pushGtmEcomEvent(event: string, payload: GtmEcomPayload) {
  if (typeof window === 'undefined') return;
  if (typeof window.__PS_PUSH_GTM_ECOM__ === 'function') {
    window.__PS_PUSH_GTM_ECOM__(event, payload);
    return;
  }
  fallbackPushGtmEcomEvent(event, payload);
}
