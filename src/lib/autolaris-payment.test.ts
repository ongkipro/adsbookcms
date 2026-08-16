import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTOLARIS_CHANNEL_OPTIONS,
  parseAutoLarisPaymentResponse,
} from "./autolaris-client.ts";
import { summarizePaymentBuckets } from "./autolaris-balance.ts";
import { reconcileAutoLarisPaidPayment } from "./autolaris-reconciliation.ts";

test("AutoLaris response parsing preserves provider instructions and billed total", () => {
  const payment = parseAutoLarisPaymentResponse({
    rc: "00",
    data: {
      trx_id: "TRX-123",
      virtual_account: "1234567890",
      qr: "000201010212...",
      payment_code: "PAY-123",
      url: "https://pay.example.test/TRX-123",
      amount: 180000,
      admin: 2500,
      total: 182500,
    },
  });
  assert.deepEqual(payment, {
    transactionId: "TRX-123",
    virtualAccount: "1234567890",
    qr: "000201010212...",
    paymentCode: "PAY-123",
    url: "https://pay.example.test/TRX-123",
    amount: 180000,
    admin: 2500,
    total: 182500,
  });
});

test("AutoLaris channels map QRIS separately from bank transfer channels", () => {
  const qris = AUTOLARIS_CHANNEL_OPTIONS.find((option) => option.code === "QRIS");
  assert.equal(qris?.paymentMethod, "qris");
  assert.equal(
    AUTOLARIS_CHANNEL_OPTIONS
      .filter((option) => option.code !== "QRIS")
      .every((option) => option.paymentMethod === "bank_transfer"),
    true,
  );
  assert.equal(
    AUTOLARIS_CHANNEL_OPTIONS.map((option) => String(option.code)).includes("DANA"),
    false,
  );
});

test("recorded balance separates paid funds, pending bills, fees, and failures", () => {
  const summary = summarizePaymentBuckets([
    { status: "paid", transaction_count: 2, billed_total: 350000, admin_fees: 5000 },
    { status: "pending", transaction_count: 1, billed_total: 175000, admin_fees: 2500 },
    { status: "failed", transaction_count: 3, billed_total: 0, admin_fees: 0 },
  ]);
  assert.deepEqual(summary, {
    paidFunds: 350000,
    pendingBilled: 175000,
    recordedFees: 7500,
    failedCount: 3,
  });
});

test("paid reconciliation is idempotent and preserves the first paid timestamp", async () => {
  const state = {
    transactionStatus: "pending",
    paymentStatus: "pending",
    paidAt: null as string | null,
    shippingStatus: "pending",
  };
  type MockStatement = {
    sql: string;
    args: unknown[];
    bind: (...args: unknown[]) => MockStatement;
    first: () => Promise<unknown>;
  };
  const database = {
    prepare(sql: string) {
      const statement: MockStatement = {
        sql,
        args: [],
        bind(...args: unknown[]) {
          statement.args = args;
          return statement;
        },
        async first() {
          return {
            transaction_id: 10,
            order_id: 20,
            order_number: "INV-20260810-TEST",
            provider_transaction_id: "TRX-TEST",
            reference_id: "INV-20260810-TEST",
            status: state.transactionStatus,
            shipping_status: state.shippingStatus,
            warehouse_id: 1,
            destination_area_id: "destination-1",
            courier_code: "JNE",
            address: "Jalan Pengujian Nomor 10",
          };
        },
      };
      return statement;
    },
    async batch(statements: MockStatement[]) {
      const paidAt = String(statements[0]?.args[0] || "");
      const transitioned = state.transactionStatus !== "paid";
      if (transitioned) {
        state.transactionStatus = "paid";
        state.paymentStatus = "paid";
        state.paidAt = paidAt;
      }
      return [
        { success: true, meta: { changes: transitioned ? 1 : 0 }, results: [] },
        { success: true, meta: { changes: 1 }, results: [] },
      ];
    },
  } as unknown as D1Database;

  const first = await reconcileAutoLarisPaidPayment(database, {
    providerTransactionId: "TRX-TEST",
    referenceId: "INV-20260810-TEST",
  });
  const originalPaidAt = state.paidAt;
  const duplicate = await reconcileAutoLarisPaidPayment(database, {
    providerTransactionId: "TRX-TEST",
    referenceId: "INV-20260810-TEST",
  });

  assert.equal(first.transitioned, true);
  assert.equal(duplicate.transitioned, false);
  assert.equal(first.shippingQueued, false);
  assert.equal(state.paymentStatus, "paid");
  assert.equal(state.shippingStatus, "pending");
  assert.equal(state.paidAt, originalPaidAt);
});

