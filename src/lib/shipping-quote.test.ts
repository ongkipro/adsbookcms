import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCityAverageFallbackRate,
  calculateCityAverageShippingRate,
} from "./shipping-fallback.ts";
import { resolveEligibleShippingRates } from "./shipping-quote.ts";

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
function createQuoteDatabase() {
  return {
    prepare(sql: string) {
      return {
        bind() {
          return this;
        },
        async first() {
          if (sql.includes("FROM warehouses")) {
            return {
              id: 1,
              origin_area_id: "5fc62f63f8f44b34aa4c0e0a",
              pickup_address_id: "60a7e58129a00812ab99011a",
            };
          }
          if (sql.includes("SELECT mengantar_api_key")) {
            return {
              mengantar_api_key: "qa-key",
              mengantar_base_url: "https://mengantar.example.test",
              autolaris_api_key: null,
              autolaris_base_url: null,
            };
          }
          throw new Error(`Unexpected first query: ${sql}`);
        },
        async all() {
          if (sql.includes("FROM courier_rules")) {
            return {
              success: true,
              meta: {},
              results: [
                { courier_code: "SiCepat", is_enabled: 1, is_cod_enabled: 1 },
              ],
            };
          }
          throw new Error(`Unexpected all query: ${sql}`);
        },
      };
    },
  } as unknown as D1Database;
}

test("a COD checkout quote never asks Mengantar for its COD fee", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return Response.json({
      success: true,
      data: { SiCepat: { price: 8_500, codFee: 8_324, estimate_delivery: "2" } },
    });
  };

  const quote = await resolveEligibleShippingRates(
    createQuoteDatabase(),
    {} as App.Locals,
    { destinationId: "5fc62f63f8f44b34aa4c0e0b", paymentMethod: "cod" },
  );

  // Asking would invite the provider fee into a cost that already carries this
  // store's own COD service fee — the buyer would pay for it twice.
  assert.equal(requestedUrl.includes("COD_AMOUNT"), false);
  assert.equal(quote.rates.length, 1);
  assert.equal(quote.rates[0].price, 8_500);
  assert.equal(quote.rates[0].cod_fee, 8_324);
});
