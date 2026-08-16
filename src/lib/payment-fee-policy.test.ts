import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAutoLarisRequestAmount,
  calculateCodFeeBreakdown,
  calculateCodCustomerTotal,
  calculatePaymentAdminFee,
  normalizePaymentFeeBearer,
} from "./payment-fee-policy.ts";

test("payment fee schedule distinguishes BCA, other VA, and QRIS", () => {
  assert.equal(calculatePaymentAdminFee("VABCA", 150_000), 6_500);
  assert.equal(calculatePaymentAdminFee("VAMANDIRI", 150_000), 3_000);
  assert.equal(calculatePaymentAdminFee("QRIS", 150_000), 1_050);
});

test("COD fee is 3% of product plus shipping and VAT is 11% of that fee", () => {
  assert.deepEqual(calculateCodFeeBreakdown(100_000), {
    baseAmount: 100_000,
    serviceFee: 3_000,
    vat: 330,
    totalFee: 3_330,
  });
  assert.deepEqual(calculateCodFeeBreakdown(158_500), {
    baseAmount: 158_500,
    serviceFee: 4_755,
    vat: 524,
    totalFee: 5_279,
  });
});

test("COD fee normalizes invalid and fractional revenue before charging", () => {
  assert.deepEqual(calculateCodFeeBreakdown(-1), {
    baseAmount: 0,
    serviceFee: 0,
    vat: 0,
    totalFee: 0,
  });
  assert.equal(calculateCodFeeBreakdown(100_000.4).baseAmount, 100_000);
});

test("COD bearer changes only the customer total", () => {
  assert.equal(calculateCodCustomerTotal(158_500, "buyer"), 163_779);
  assert.equal(calculateCodCustomerTotal(158_500, "seller"), 158_500);
});

test("buyer bearer sends the order total and adds the provider fee", () => {
  const orderTotal = 170_000;
  const requested = calculateAutoLarisRequestAmount("VABRI", orderTotal, "buyer");
  assert.equal(requested, orderTotal);
  assert.equal(requested + calculatePaymentAdminFee("VABRI", requested), 173_000);
});

test("seller bearer reduces the provider amount so the buyer pays the order total", () => {
  const orderTotal = 170_000;
  const vaAmount = calculateAutoLarisRequestAmount("VABCA", orderTotal, "seller");
  assert.equal(vaAmount, 163_500);
  assert.equal(vaAmount + calculatePaymentAdminFee("VABCA", vaAmount), orderTotal);

  const qrisAmount = calculateAutoLarisRequestAmount("QRIS", orderTotal, "seller");
  assert.equal(qrisAmount + calculatePaymentAdminFee("QRIS", qrisAmount), orderTotal);
});

test("invalid persisted fee bearer fails closed to buyer", () => {
  assert.equal(normalizePaymentFeeBearer("seller"), "seller");
  assert.equal(normalizePaymentFeeBearer("merchant"), "buyer");
  assert.equal(normalizePaymentFeeBearer(null), "buyer");
});
