import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTOLARIS_CHANNEL_OPTIONS,
  parseAutoLarisPaymentResponse,
} from "./autolaris-client.ts";
import { summarizePaymentBuckets } from "./autolaris-balance.ts";
import { createAutoLarisPaymentForOrder } from "./autolaris-payment.ts";

function createAutoLarisOrderDatabase(originAreaId: string | null) {
  const state = {
    transaction: null as null | Record<string, unknown>,
  };
  const order = {
    id: 41,
    order_number: "INV-10041",
    store_id: 1,
    customer_name: "Buyer",
    customer_phone: "081331000000",
    customer_email: "buyer@example.test",
    address: "Buyer Street",
    province: "Jawa Timur",
    city: "Nganjuk",
    district: "Sawahan",
    postal_code: "64475",
    destination_area_id: "3518010",
    total_amount: 118_400,
    payment_method: "qris",
    payment_fee_bearer: "seller",
    store_name: "QA Store",
    warehouse_name: "QA Warehouse",
    origin_area_id: originAreaId,
    warehouse_contact_name: "Warehouse PIC",
    warehouse_contact_phone: "08123456789",
    warehouse_address: "Warehouse Street",
    warehouse_city: "Surabaya",
    warehouse_province: "Jawa Timur",
  };
  const item = {
    quantity: 2,
    unit_price: 50_000,
    weight_grams: 600,
    product_title: "QA Product",
    variant_title: "500 ml",
  };

  const database = {
    prepare(sql: string) {
      const statement = {
        args: [] as unknown[],
        bind(...args: unknown[]) {
          statement.args = args;
          return statement;
        },
        async first() {
          if (sql.includes("FROM payment_transactions pt")) {
            return state.transaction;
          }
          if (sql.includes("SELECT o.id, o.order_number")) return order;
          if (sql.includes("SELECT mengantar_api_key")) {
            return {
              mengantar_api_key: null,
              mengantar_base_url: null,
              autolaris_api_key: "qa-key",
              autolaris_base_url: "https://autolaris.example.test",
            };
          }
          throw new Error(`Unexpected first query: ${sql}`);
        },
        async all() {
          if (sql.includes("FROM order_items oi")) {
            return { success: true, results: [item], meta: {} };
          }
          throw new Error(`Unexpected all query: ${sql}`);
        },
        async run() {
          if (sql.includes("INSERT INTO payment_transactions")) {
            state.transaction = {
              id: 91,
              order_id: order.id,
              order_number: order.order_number,
              public_token: statement.args[2],
              channel_code: statement.args[3],
              fee_bearer: statement.args[4],
              status: "pending",
              amount: statement.args[5],
              admin_fee: statement.args[6],
              total_amount: statement.args[7],
              virtual_account: null,
              qr_payload: null,
              payment_code: null,
              provider_payment_url: null,
              expires_at: statement.args[8],
              failed_reason: null,
            };
          } else if (sql.includes("provider_transaction_id = ?")) {
            Object.assign(state.transaction!, {
              amount: statement.args[1],
              admin_fee: statement.args[2],
              total_amount: statement.args[3],
              virtual_account: statement.args[4],
              qr_payload: statement.args[5],
              payment_code: statement.args[6],
              provider_payment_url: statement.args[7],
              failed_reason: null,
            });
          } else if (sql.includes("SET status = 'failed'")) {
            Object.assign(state.transaction!, {
              status: "failed",
              failed_reason: statement.args[0],
            });
          } else {
            throw new Error(`Unexpected run query: ${sql}`);
          }
          return { success: true, meta: { changes: 1 }, results: [] };
        },
      };
      return statement;
    },
  } as unknown as D1Database;

  return { database, state };
}

test("payment orchestration sources the AutoLaris Create Order payload from D1", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const { database } = createAutoLarisOrderDatabase("3517100");
  let requestedUrl = "";
  let requestedBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      rc: "00",
      data: {
        transaction_id: "TRX-SUBMIT-41",
        biaya_admin: 84,
        total: 118_484,
        payment_info: { va: "", qr: "QR-PAYLOAD", url: "" },
      },
    });
  };

  const payment = await createAutoLarisPaymentForOrder(
    database,
    {} as App.Locals,
    { orderId: 41, channelCode: "QRIS" },
  );

  assert.equal(requestedUrl, "https://autolaris.example.test/api/h2h/submit");
  assert.deepEqual(
    {
      courir_id: requestedBody?.courir_id,
      origin: requestedBody?.origin,
      destination: requestedBody?.destination,
      weight: requestedBody?.weight,
      shipper_name: requestedBody?.shipper_name,
      receiver_name: requestedBody?.receiver_name,
      callback_url: requestedBody?.callback_url,
      grand_total: requestedBody?.grand_total,
      order_details: requestedBody?.order_details,
    },
    {
      courir_id: 1,
      origin: 3517100,
      destination: 3518010,
      weight: "1200",
      shipper_name: "Warehouse PIC",
      receiver_name: "Buyer",
      callback_url: "",
      grand_total: "100000",
      order_details: [
        { name: "QA Product - 500 ml", qty: "2", unit_price: "50000" },
      ],
    },
  );
  assert.equal(payment.qrPayload, "QR-PAYLOAD");
  assert.equal(payment.adminFee, 84);
  assert.equal(payment.totalAmount, 118_484);
});

test("payment orchestration records failure without a provider call when D1 shipping identity is incomplete", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const { database } = createAutoLarisOrderDatabase(null);
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return new Response(null, { status: 500 });
  };

  const payment = await createAutoLarisPaymentForOrder(
    database,
    {} as App.Locals,
    { orderId: 41, channelCode: "QRIS" },
  );

  assert.equal(providerCalls, 0);
  assert.equal(payment.status, "failed");
  assert.match(payment.failedReason || "", /origin.*tidak lengkap/i);
});

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
