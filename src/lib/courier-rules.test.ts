import assert from "node:assert/strict";
import test from "node:test";
import { isCourierRateEnabled, selectQuotedRate } from "./courier-rules.ts";

const rules = [
  { courier_code: "JNE", is_enabled: 1, is_cod_enabled: 1 },
  { courier_code: "J&T", is_enabled: 1, is_cod_enabled: 0 },
  { courier_code: "Paxel", is_enabled: 0, is_cod_enabled: 1 },
];

test("courier availability enforces service and COD switches", () => {
  assert.equal(isCourierRateEnabled("JNE", rules, true), true);
  assert.equal(isCourierRateEnabled("JT", rules, false), true);
  assert.equal(isCourierRateEnabled("JT", rules, true), false);
  assert.equal(isCourierRateEnabled("Paxel", rules, false), false);
  assert.equal(isCourierRateEnabled("Unknown", rules, false), false);
});

const rates = [
  {
    courier_code: "JNE",
    courier_service: "REG",
    price: 18_000,
    estimated_days: "2-3",
    unsupported: false,
    unsupported_cod: false,
    cod_fee: 0,
  },
  {
    courier_code: "J&T",
    courier_service: "EZ",
    price: 16_000,
    estimated_days: "2-3",
    unsupported: false,
    unsupported_cod: false,
    cod_fee: 0,
  },
];

test("selected shipping service must match its quoted courier", () => {
  assert.equal(selectQuotedRate(rates, "jne", 1), rates[0]);
  assert.equal(selectQuotedRate(rates, "JNE", 2), rates[0]);
  assert.equal(selectQuotedRate(rates, "unknown", 1), undefined);
});

test("ambiguous courier fallback is rejected without a matching service index", () => {
  const duplicate = { ...rates[0], courier_service: "YES", price: 25_000 };
  assert.equal(selectQuotedRate([...rates, duplicate], "JNE", 99), undefined);
});
