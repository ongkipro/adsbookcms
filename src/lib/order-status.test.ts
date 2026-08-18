import assert from "node:assert/strict";
import test from "node:test";
import { POST as readHeadlessOrderStatus } from "../pages/api/v1/orders/status.ts";
import { hashApiKeySecret } from "./developer-api-keys.ts";

function createStatusDatabase(keyHash: string) {
  const auditStatuses: number[] = [];
  const database = {
    prepare(query: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...bound: unknown[]) {
          values = bound;
          return statement;
        },
        async first() {
          if (query.includes("SELECT headless_allowed_origins")) {
            return { headless_allowed_origins: null };
          }
          if (query.includes("FROM developer_api_keys")) {
            return {
              id: 41,
              key_hash: keyHash,
              scopes: "orders:read",
              rate_limit_per_minute: 10,
              daily_quota: 100,
            };
          }
          if (query.includes("INSERT INTO developer_api_key_usage")) {
            return { request_count: 1 };
          }
          if (query.includes("FROM orders o")) {
            const [firstIdentity, secondIdentity, token] = values;
            if (
              firstIdentity !== "ORD-OWNED-001" ||
              secondIdentity !== "ORD-OWNED-001" ||
              token !== "status-token-owned"
            ) {
              return null;
            }
            return {
              order_number: "ORD-OWNED-001",
              total_amount: 175000,
              payment_method: "cod",
              payment_status: "unpaid",
              shipping_status: "pending",
            };
          }
          return null;
        },
        async run() {
          if (query.includes("INSERT INTO headless_api_audit_events")) {
            auditStatuses.push(Number(values[3]));
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  return { database, auditStatuses };
}

async function callStatusRoute(database: D1Database, secret: string, body: Record<string, unknown>) {
  return readHeadlessOrderStatus({
    request: new Request("https://store.example/api/v1/orders/status", {
      method: "POST",
      headers: { "content-type": "application/json", "x-app-key": secret },
      body: JSON.stringify(body),
    }),
    locals: { runtimeEnv: { OMS_DB: database } },
  } as never);
}

test("headless order status requires the checkout-issued identity and token without leaking another order", async () => {
  const secret = "adsbook_live_order_status_test_secret";
  const { database, auditStatuses } = createStatusDatabase(await hashApiKeySecret(secret));

  const denied = await callStatusRoute(database, secret, {
    order_number: "ORD-OWNED-001",
    status_token: "wrong-token",
  });
  assert.equal(denied.status, 404);
  const deniedPayload = await denied.json() as {
    success: boolean;
    error: { code: string; message: string };
  };
  assert.equal(deniedPayload.success, false);
  assert.equal(deniedPayload.error.code, "ORDER_NOT_FOUND");
  assert.doesNotMatch(JSON.stringify(deniedPayload), /175000|unpaid|pending/);
  assert.deepEqual(auditStatuses, [404]);

  const allowed = await callStatusRoute(database, secret, {
    order_number: "ORD-OWNED-001",
    status_token: "status-token-owned",
  });
  assert.equal(allowed.status, 200);
  const allowedPayload = await allowed.json() as {
    success: boolean;
    order: { order_number: string; total_amount: number; status: string };
  };
  assert.equal(allowedPayload.success, true);
  assert.deepEqual(allowedPayload.order, {
    is_paid: false,
    order_number: "ORD-OWNED-001",
    payment_method: "cod",
    payment_status: "unpaid",
    status: "pending",
    total_amount: 175000,
    payment: null,
  });
  assert.deepEqual(auditStatuses, [404, 200]);
});
