import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../pages/api/record-abandoned-order.ts";
import { POST as POST_RETENTION } from "../pages/api/admin/orders/retention.ts";

function abandonedRequest(body: Record<string, unknown>) {
  return new Request("https://shop.example/api/record-abandoned-order", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.10",
    },
    body: JSON.stringify(body),
  });
}

const qualifiedLead = {
  customer_name: "Siti Rahayu",
  customer_phone: "081234567890",
};

test("abandoned capture rejects a filled honeypot before any KV or D1 operation", async () => {
  let databaseOperations = 0;
  let kvOperations = 0;
  const response = await POST({
    request: abandonedRequest({
      ...qualifiedLead,
      website: "https://spam.example",
    }),
    locals: {
      runtimeEnv: {
        OMS_DB: {
          prepare() {
            databaseOperations += 1;
            throw new Error("honeypot reached D1");
          },
        },
        SESSION: {
          async get() {
            kvOperations += 1;
            throw new Error("honeypot reached KV");
          },
        },
      },
    },
  } as never);

  assert.equal(response.status, 400);
  assert.equal((await response.json() as { code?: string }).code, "HONEYPOT_TRIGGERED");
  assert.equal(databaseOperations, 0);
  assert.equal(kvOperations, 0);
});

test("a qualified human lead inside the KV window is recorded", async () => {
  let spentSlots = 0;
  const database = {
    prepare(sql: string) {
      const statement = {
        bind() {
          return statement;
        },
        async first() {
          if (
            sql.includes("FROM orders") &&
            sql.includes("shipping_status = 'abandoned'")
          ) {
            return null;
          }
          if (sql.includes("SELECT id FROM stores")) return { id: 1 };
          if (sql.includes("UPDATE order_number_counters")) {
            return { last_value: 10001 };
          }
          throw new Error(`Unexpected query: ${sql}`);
        },
      };
      return statement;
    },
    async batch(statements: unknown[]) {
      return statements.map((_, index) => ({
        results:
          index === statements.length - 1
            ? [{ id: 1, order_number: "ABN-10001" }]
            : [],
      }));
    },
  };
  const response = await POST({
    request: abandonedRequest({ ...qualifiedLead, website: "" }),
    locals: {
      runtimeEnv: {
        OMS_DB: database,
        SESSION: {
          async get() {
            return null;
          },
          async put() {
            spentSlots += 1;
          },
        },
      },
    },
  } as never);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    action: "created",
    order_number: "ABN-10001",
  });
  assert.equal(spentSlots, 1);
});

test("abandoned capture is rejected when the shared KV window is exhausted", async () => {
  let databaseOperations = 0;
  const response = await POST({
    request: abandonedRequest(qualifiedLead),
    locals: {
      runtimeEnv: {
        OMS_DB: {
          prepare() {
            databaseOperations += 1;
            throw new Error("rate-limited request reached D1");
          },
        },
        SESSION: {
          async get(key: string) {
            assert.match(key, /^record-abandoned-order:203\.0\.113\.10:/);
            return "10";
          },
          async put() {
            throw new Error("exhausted window was incremented");
          },
        },
      },
    },
  } as never);

  assert.equal(response.status, 429);
  assert.equal((await response.json() as { code?: string }).code, "RATE_LIMITED");
  assert.ok(Number(response.headers.get("retry-after")) >= 1);
  assert.equal(databaseOperations, 0);
});

test("authenticated retention POST executes the write-side purge", async () => {
  const statements: string[] = [];
  const database = {
    prepare(sql: string) {
      statements.push(sql);
      const statement = {
        bind() {
          return statement;
        },
      };
      return statement;
    },
    async batch() {
      return [
        { meta: { changes: 1 } },
        { meta: { changes: 1 } },
        { meta: { changes: 2 } },
      ];
    },
  };

  const response = await POST_RETENTION({
    locals: {
      admin: { username: "owner", role: "owner" },
      runtimeEnv: { OMS_DB: database },
    },
  } as never);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    deleted_count: 2,
    retention_days: 7,
  });
  assert.equal(statements.length, 3);
  assert.ok(statements.every((sql) => sql.startsWith("DELETE FROM")));
});
