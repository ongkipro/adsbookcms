import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../pages/api/order-status.ts";

/**
 * The public status endpoint with its payment-retry gate. The fake answers
 * the status join, the pk lookup, the rate-limit statements, and records
 * whether the AutoLaris orchestration was reached (its order SELECT).
 */
function createDatabase(options: {
  transactionStatus: string | null;
  paymentStatus?: string;
  shippingStatus?: string;
  channel?: string;
  paymentMethod?: string;
  perOrderCount?: number;
}) {
  const reached = { orchestration: 0 };
  const database = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...next: unknown[]) {
          values = next;
          return statement;
        },
        async first() {
          if (sql.includes("SELECT count FROM rate_limits")) {
            return String(values[0]).startsWith("public-payment-retry-order:")
              ? { count: options.perOrderCount ?? 0 }
              : null;
          }
          if (sql.includes("INSERT INTO rate_limits")) return { count: 1 };
          if (sql.includes("SELECT id FROM orders")) return { id: 41 };
          if (sql.includes("FROM orders o") && sql.includes("LEFT JOIN payment_transactions pt")) {
            if (values[2] !== "tok-41") return null;
            return {
              order_number: "INV-10041",
              total_amount: 118_400,
              product_value: 100_000,
              payment_method: options.paymentMethod ?? "qris",
              payment_status: options.paymentStatus ?? "pending",
              shipping_status: options.shippingStatus ?? "pending",
              channel_code: options.transactionStatus ? (options.channel ?? "QRIS") : null,
              fee_bearer: "buyer",
              transaction_status: options.transactionStatus,
              amount: 118_400,
              admin_fee: 0,
              payment_total: 118_400,
              virtual_account: null,
              qr_payload: options.transactionStatus === "pending" ? "QR" : null,
              payment_code: null,
              provider_payment_url: null,
              expires_at: new Date(Date.now() + 3_600_000).toISOString(),
              failed_reason: options.transactionStatus === "failed" ? "upstream down" : null,
            };
          }
          if (sql.includes("FROM payment_transactions pt")) {
            reached.orchestration += 1;
            // Pretend the orchestration found a live row so it stops here.
            return {
              id: 91, order_id: 41, order_number: "INV-10041", public_token: "p", channel_code: "QRIS",
              fee_bearer: "buyer", status: "pending", amount: 118_400, admin_fee: 0, total_amount: 118_400,
              virtual_account: null, qr_payload: "QR", payment_code: null, provider_payment_url: null,
              expires_at: new Date(Date.now() + 3_600_000).toISOString(), failed_reason: null,
            };
          }
          throw new Error(`unexpected first(): ${sql}`);
        },
        async run() {
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  return { database, reached };
}

const call = (database: D1Database, body: Record<string, unknown>) =>
  POST({
    request: new Request("https://store.example.test/api/order-status", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.5" },
      body: JSON.stringify(body),
    }),
    locals: { runtimeEnv: { OMS_DB: database }, tenant: { siteUrl: "https://store.example.test" } },
  } as never);

test("a plain status read never reaches the payment orchestration", async () => {
  const { database, reached } = createDatabase({ transactionStatus: "failed" });
  const response = await call(database, { order_pk: "41", status_token: "tok-41" });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { payment: { status: string } };
  assert.equal(body.payment.status, "failed");
  assert.equal(reached.orchestration, 0);
});

test("retry regenerates only a failed or expired instruction on a live unpaid order", async () => {
  const yes = createDatabase({ transactionStatus: "failed" });
  assert.equal((await call(yes.database, { order_pk: "41", status_token: "tok-41", retry_payment: true })).status, 200);
  assert.equal(yes.reached.orchestration, 1);

  for (const blocked of [
    { transactionStatus: "pending" },                              // live instruction
    { transactionStatus: "failed", shippingStatus: "cancelled" },  // cancelled order
    { transactionStatus: "failed", paymentStatus: "refunded" },    // refunded order
    { transactionStatus: "failed", paymentMethod: "manual_transfer", channel: "BCA" },
    { transactionStatus: null },                                   // no instruction row at all
  ]) {
    const { database, reached } = createDatabase(blocked);
    const response = await call(database, { order_pk: "41", status_token: "tok-41", retry_payment: true });
    assert.equal(response.status, 200, JSON.stringify(blocked));
    assert.equal(reached.orchestration, 0, JSON.stringify(blocked));
  }
});

test("a wrong token is a 404 and a per-order retry ceiling is a 429, both before the provider", async () => {
  const wrong = createDatabase({ transactionStatus: "failed" });
  assert.equal((await call(wrong.database, { order_pk: "41", status_token: "nope", retry_payment: true })).status, 404);
  assert.equal(wrong.reached.orchestration, 0);

  const capped = createDatabase({ transactionStatus: "failed", perOrderCount: 3 });
  const response = await call(capped.database, { order_pk: "41", status_token: "tok-41", retry_payment: true });
  assert.equal(response.status, 429);
  assert.equal(capped.reached.orchestration, 0);
});
