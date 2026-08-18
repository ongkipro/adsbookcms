import {
  isCourierRateEnabled,
  type CourierAvailabilityRule,
} from "./courier-rules.ts";
import { getEnvValue, getRuntimeEnv } from "./env.ts";
import { MengantarClient, type CourierRateResult } from "./mengantar-client.ts";
import { getProviderConfig } from "./provider-config.ts";
import { buildCityAverageFallbackRate } from "./shipping-fallback.ts";

export type ShippingQuoteInput = {
  destinationId: string;
  destinationCity?: string;
  paymentMethod: string;
  variantKey?: string;
  originId?: string;
  fallbackWeightKg?: number;
  quantity?: number;
};

export class ShippingQuoteError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export type QuotedVariant = {
  productTitle: string;
  variantTitle: string;
  unitPrice: number;
  unitWeightKg: number;
};
export type QuotedWarehouse = {
  id: number;
  origin_area_id: string;
  pickup_address_id: string;
};

export type ResolvedShippingRates = {
  originId: string;
  rates: CourierRateResult[];
  warehouse?: QuotedWarehouse;
  variant?: QuotedVariant;
  fallbackUsed?: boolean;
};

const normalizeCity = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("id-ID")
    .replace(/\b(kota|kabupaten|kab)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();



export async function resolveEligibleShippingRates(
  database: D1Database,
  locals: App.Locals,
  input: ShippingQuoteInput,
): Promise<ResolvedShippingRates> {
  const destinationId = input.destinationId.trim();
  if (!destinationId) {
    throw new ShippingQuoteError(
      "Pilih kecamatan dari hasil pencarian sebelum menghitung ongkir.",
      "DESTINATION_NOT_RESOLVED",
      422,
    );
  }

  const quantity =
    Number.isInteger(input.quantity) && Number(input.quantity) > 0
      ? Number(input.quantity)
      : 1;
  let weightKg = (input.fallbackWeightKg || 1) * quantity;
  let quotedVariant: QuotedVariant | undefined;
  if (input.variantKey) {
    const variant = await database
      .prepare(
        `
        SELECT
          pv.weight_grams,
          pv.price,
          pv.title AS variant_title,
          p.title AS product_title
        FROM product_variants pv
        INNER JOIN products p ON p.id = pv.product_id
        WHERE CAST(pv.id AS TEXT) = ?
          AND p.is_active = 1
        LIMIT 1
      `,
      )
      .bind(input.variantKey)
      .first<{
        weight_grams: number;
        price: number;
        variant_title: string;
        product_title: string;
      }>();
    if (!variant) {
      throw new ShippingQuoteError(
        "Varian aktif tidak ditemukan.",
        "VARIANT_NOT_FOUND",
        404,
      );
    }
    const unitWeightKg = Math.max(0.001, Number(variant.weight_grams) / 1000);
    weightKg = unitWeightKg * quantity;
    quotedVariant = {
      productTitle: variant.product_title,
      variantTitle: variant.variant_title,
      unitPrice: Number(variant.price),
      unitWeightKg,
    };
  }

  const warehouse =
    (await database
      .prepare(
        "SELECT id, origin_area_id, pickup_address_id FROM warehouses ORDER BY id LIMIT 1",
      )
      .first<QuotedWarehouse>()) || undefined;

  let originId =
    input.originId?.trim() || warehouse?.origin_area_id?.trim() || "";
  const env = getRuntimeEnv(locals);
  if (!originId) originId = getEnvValue("MENGANTAR_ORIGIN_AREA_ID", env) || "";
  const config = (await getProviderConfig(database, locals)).mengantar;
  if (!originId || !config.apiKey) {
    throw new ShippingQuoteError(
      "Mengantar API atau origin gudang belum dikonfigurasi.",
      "SHIPPING_UNAVAILABLE",
      503,
    );
  }

  const client = new MengantarClient(config.apiKey, config.baseUrl);
  const [rates, ruleResult] = await Promise.all([
    client.estimateRates({
      originId,
      destinationId,
      weight: weightKg,
    }),
    database
      .prepare(
        `
        SELECT courier_code, is_enabled, is_cod_enabled
        FROM courier_rules
        ORDER BY id
      `,
      )
      .all<CourierAvailabilityRule>(),
  ]);
  const rules = ruleResult.results ?? [];
  const isCod = input.paymentMethod === "cod";
  const eligible = (providerRates: CourierRateResult[]) =>
    providerRates
      .filter((rate) =>
        isCourierRateEnabled(rate.courier_code, rules, isCod),
      )
      .filter(
        (rate) =>
          !rate.unsupported && Number.isFinite(rate.price) && rate.price > 0,
      )
      .filter((rate) => !isCod || !rate.unsupported_cod);
  const eligibleRates = eligible(rates);
  if (eligibleRates.length > 0 || !input.destinationCity?.trim()) {
    return {
      originId,
      rates: eligibleRates,
      warehouse,
      variant: quotedVariant,
    };
  }

  const cityKey = normalizeCity(input.destinationCity);
  const candidates = (await client.searchAddress(input.destinationCity))
    .filter(
      (item) =>
        item._id &&
        item._id !== destinationId &&
        normalizeCity(item.CITY_NAME || "") === cityKey,
    )
    .filter(
      (item, index, all) =>
        all.findIndex((candidate) => candidate._id === item._id) === index,
    )
    .slice(0, 3);
  const sampleResults = await Promise.allSettled(
    candidates.map((candidate) =>
      client.estimateRates({
        originId,
        destinationId: candidate._id,
        weight: weightKg,
      }),
    ),
  );
  const citySamples = sampleResults.flatMap((result) => {
    if (result.status !== "fulfilled") return [];
    const cheapest = eligible(result.value)
      .map(
        (rate) =>
          rate.price + (isCod ? Number(rate.cod_fee || 0) : 0),
      )
      .sort((left, right) => left - right)[0];
    return cheapest ? [cheapest] : [];
  });
  const fallbackRate = buildCityAverageFallbackRate(citySamples);
  if (!fallbackRate) {
    return { originId, rates: [], warehouse, variant: quotedVariant };
  }

  return {
    originId,
    warehouse,
    variant: quotedVariant,
    fallbackUsed: true,
    rates: [fallbackRate],
  };
}
