import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCityAverageFallbackRate,
  calculateCityAverageShippingRate,
} from "./shipping-fallback.ts";

test("city shipping fallback averages valid samples and rounds to Rp1.000", () => {
  assert.equal(calculateCityAverageShippingRate([12_000, 15_500, 20_000]), 16_000);
});

test("city shipping fallback ignores invalid samples and refuses fabricated zero", () => {
  assert.equal(calculateCityAverageShippingRate([0, Number.NaN, -2_000]), 0);
  assert.equal(calculateCityAverageShippingRate([500]), 1_000);
});


test("city shipping fallback uses the internal ICO expedition contract", () => {
  assert.deepEqual(buildCityAverageFallbackRate([12_000, 15_500, 20_000]), {
    courier_code: "ICO",
    courier_service: "CITY_AVERAGE",
    price: 16_000,
    estimated_days: "Dikonfirmasi admin",
    unsupported: false,
    unsupported_cod: false,
    cod_fee: 0,
    is_fallback: true,
  });
  assert.equal(buildCityAverageFallbackRate([]), undefined);
});