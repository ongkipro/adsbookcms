import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePaymentBrandCode,
  paymentBrandAsset,
} from "./payment-brand.ts";

test("payment brands expose lightweight checkout assets", () => {
  assert.equal(paymentBrandAsset("cod"), "/images/payment/cod.webp");
  assert.equal(paymentBrandAsset("QRIS"), "/images/payment/qris.svg");
  assert.equal(paymentBrandAsset("VABCA"), "/images/payment/bca.svg");
});

test("payment brand normalization remains frontend-safe", () => {
  assert.equal(normalizePaymentBrandCode(" vaMandiri "), "MANDIRI");
  assert.equal(normalizePaymentBrandCode("qr"), "QRIS");
});
