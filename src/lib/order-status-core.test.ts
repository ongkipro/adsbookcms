import assert from "node:assert/strict";
import test from "node:test";
import { loadPublicOrderStatus, resolvePublicOrderId } from "./order-status.ts";

function fakeDatabase(row: Record<string, unknown> | null, idRow: Record<string, unknown> | null = null) {
  return {
    prepare(sql: string) {
      return {
        bind() {
          return this;
        },
        async first() {
          return sql.includes("SELECT id FROM orders") ? idRow : row;
        },
      };
    },
  } as unknown as D1Database;
}

test("loadPublicOrderStatus returns null when the identity/token pair does not match", async () => {
  const result = await loadPublicOrderStatus(fakeDatabase(null), "ORD-1", "wrong-token");
  assert.equal(result, null);
});

test("a COD order with no payment_transactions row reports no payment leg", async () => {
  const result = await loadPublicOrderStatus(
    fakeDatabase({
      order_number: "ORD-1",
      total_amount: 100000,
      product_value: 90000,
      payment_method: "cod",
      payment_status: "unpaid",
      shipping_status: "pending",
      channel_code: null,
    }),
    "ORD-1",
    "token",
  );
  assert.ok(result);
  assert.equal(result.payment, null);
  assert.equal(result.is_paid, false);
  assert.equal(result.product_value, 90000);
});

test("a QRIS order surfaces the payment leg with the effective (expiry-aware) status", async () => {
  const result = await loadPublicOrderStatus(
    fakeDatabase({
      order_number: "ORD-2",
      total_amount: 50000,
      product_value: 50000,
      payment_method: "qris",
      payment_status: "unpaid",
      shipping_status: "pending",
      channel_code: "QRIS",
      fee_bearer: "seller",
      transaction_status: "pending",
      amount: 50000,
      admin_fee: 0,
      payment_total: 50000,
      expires_at: "2020-01-01T00:00:00.000Z",
    }),
    "ORD-2",
    "token",
  );
  assert.ok(result?.payment);
  // Past its expiry, so `effectivePaymentStatus` reclassifies a still-"pending" row as expired
  // rather than reporting the stale value straight off the row.
  assert.equal(result.payment.status, "expired");
  assert.equal(result.payment.fee_bearer, "seller");
});

test("paid/settled/success all read as is_paid, everything else does not", async () => {
  for (const status of ["paid", "settled", "success"]) {
    const result = await loadPublicOrderStatus(
      fakeDatabase({ order_number: "ORD-3", payment_method: "cod", payment_status: status }),
      "ORD-3",
      "token",
    );
    assert.equal(result?.is_paid, true, `expected ${status} to be paid`);
  }
  const unpaid = await loadPublicOrderStatus(
    fakeDatabase({ order_number: "ORD-3", payment_method: "cod", payment_status: "failed" }),
    "ORD-3",
    "token",
  );
  assert.equal(unpaid?.is_paid, false);
});

test("resolvePublicOrderId returns the numeric primary key only for a matching identity/token pair", async () => {
  const found = await resolvePublicOrderId(fakeDatabase(null, { id: 42 }), "ORD-4", "token");
  assert.equal(found, 42);

  const missing = await resolvePublicOrderId(fakeDatabase(null, null), "ORD-4", "wrong");
  assert.equal(missing, null);
});
