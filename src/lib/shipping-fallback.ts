import type { CourierRateResult } from "./mengantar-client";

export function calculateCityAverageShippingRate(samples: number[]) {
  const valid = samples.filter(
    (value) => Number.isFinite(value) && value > 0,
  );
  if (valid.length === 0) return 0;
  const average = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  return Math.max(1_000, Math.round(average / 1_000) * 1_000);
}

export function buildCityAverageFallbackRate(
  samples: number[],
): CourierRateResult | undefined {
  const price = calculateCityAverageShippingRate(samples);
  if (!price) return undefined;
  return {
    courier_code: "ICO",
    courier_service: "CITY_AVERAGE",
    price,
    estimated_days: "Dikonfirmasi admin",
    unsupported: false,
    unsupported_cod: false,
    cod_fee: 0,
    is_fallback: true,
  };
}
