import { selectQuotedRate } from './courier-rules.ts';
import type { OrderSubmitInput } from './order-schema.ts';

export type ShippingQuoteFailure = Error & {
  code: string;
  status: number;
};

export type TrustedHeadlessShipping = {
  destinationId: string;
  shippingCost: number;
  courierCode: string;
  courierService: string;
  warehouseId?: number;
};

type QuoteResolver = (input: {
  destinationId: string;
  destinationCity?: string;
  paymentMethod: string;
  variantKey?: string;
  quantity?: number;
}) => Promise<{
  rates: Array<{
    courier_code: string;
    courier_service: string;
    price: number;
    estimated_days: string;
    unsupported: boolean;
    unsupported_cod: boolean;
    cod_fee: number;
  }>;
  warehouse?: {
    id: number;
  };
}>;

export function isShippingQuoteFailure(error: unknown): error is ShippingQuoteFailure {
  if (!(error instanceof Error)) return false;
  const maybeCode = Reflect.get(error, 'code');
  const maybeStatus = Reflect.get(error, 'status');
  return typeof maybeCode === 'string' && typeof maybeStatus === 'number';
}

function createShippingQuoteFailure(
  message: string,
  code: string,
  status: number,
): ShippingQuoteFailure {
  const error = new Error(message) as ShippingQuoteFailure;
  error.code = code;
  error.status = status;
  return error;
}

export async function resolveTrustedHeadlessShipping(
  body: Record<string, unknown>,
  data: OrderSubmitInput,
  quoteResolver: QuoteResolver,
): Promise<TrustedHeadlessShipping> {
  const destinationId = String(body.location_id || body.destination_id || '').trim();
  const courierCode = String(body.shipment_provider_code || body.courier_code || '').trim();
  const courierServiceId = Number(body.courier_service_id || 1);
  if (!destinationId || !courierCode) {
    throw createShippingQuoteFailure(
      'destination_id dan courier_code wajib diisi untuk checkout headless.',
      'SHIPPING_QUOTE_REQUIRED',
      422,
    );
  }

  const quote = await quoteResolver({
    destinationId,
    destinationCity: String(body.city || '').trim() || undefined,
    paymentMethod: data.payment_method,
    variantKey: data.variant_id,
    quantity: data.quantity,
  });
  const rate = selectQuotedRate(quote.rates, courierCode, courierServiceId);
  if (!rate) {
    throw createShippingQuoteFailure(
      'Tarif pengiriman yang dipilih tidak lagi tersedia. Muat ulang ongkir lalu coba lagi.',
      'SHIPPING_RATE_NOT_FOUND',
      422,
    );
  }

  return {
    destinationId,
    shippingCost: rate.price + (data.payment_method === 'cod' ? Number(rate.cod_fee || 0) : 0),
    courierCode: rate.courier_code,
    courierService: rate.courier_service,
    warehouseId: quote.warehouse?.id ? Number(quote.warehouse.id) : undefined,
  };
}
