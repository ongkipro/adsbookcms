import assert from "node:assert/strict";
import test from "node:test";
import {
  canDispatchOrderToMengantar,
  getMengantarDispatchEligibility,
} from "./payment-dispatch-policy.ts";

const completeOrder = {
  paymentMethod: "cod",
  paymentStatus: "unpaid",
  shippingStatus: "pending",
  providerOrderId: null,
  providerDispatchError: null,
  destinationAreaId: "destination-1",
  courierCode: "JNE",
  pickupAddressId: "pickup-1",
};

test("only pending orders can be explicitly dispatched", () => {
  assert.equal(canDispatchOrderToMengantar("cod", "unpaid", "pending"), true);
  assert.equal(
    canDispatchOrderToMengantar("bank_transfer", "paid", "pending"),
    true,
  );
  assert.equal(canDispatchOrderToMengantar("cod", "unpaid", "processing"), false);
  assert.equal(
    getMengantarDispatchEligibility(completeOrder).eligible,
    true,
  );
});

test("unpaid online and incomplete pending orders are not dispatchable", () => {
  assert.deepEqual(
    getMengantarDispatchEligibility({
      ...completeOrder,
      paymentMethod: "qris",
      paymentStatus: "pending",
    }),
    { eligible: false, reason: "Pembayaran online belum lunas." },
  );
  assert.deepEqual(
    getMengantarDispatchEligibility({
      ...completeOrder,
      destinationAreaId: null,
      providerDispatchError: "Provider timeout",
    }),
    { eligible: false, reason: "Kecamatan tujuan belum dipilih." },
  );
});

test("provider-created orders cannot be dispatched again", () => {
  assert.deepEqual(
    getMengantarDispatchEligibility({
      ...completeOrder,
      shippingStatus: "processing",
      providerOrderId: "mengantar-unpaid-draft-1",
      providerDispatchError: "MENGANTAR_WALLET_UNPAID",
    }),
    { eligible: false, reason: "Shipment Mengantar sudah dibuat." },
  );
});

test("failed dispatch remains pending and retryable", () => {
  const failedOrder = {
    ...completeOrder,
    providerDispatchError: "Mengantar timeout",
  };
  assert.equal(getMengantarDispatchEligibility(failedOrder).eligible, true);
  assert.equal(failedOrder.shippingStatus, "pending");
});

test("an abandoned dispatch claim becomes retryable after its lease expires", () => {
  const activeClaim = getMengantarDispatchEligibility({
    ...completeOrder,
    providerDispatchError: "DISPATCHING",
    providerDispatchClaimedAt: new Date().toISOString(),
  });
  const staleClaim = getMengantarDispatchEligibility({
    ...completeOrder,
    providerDispatchError: "DISPATCHING",
    providerDispatchClaimedAt: "2020-01-01T00:00:00.000Z",
  });

  assert.deepEqual(activeClaim, {
    eligible: false,
    reason: "Order sedang diproses oleh Mengantar.",
  });
  assert.equal(staleClaim.eligible, true);
});
