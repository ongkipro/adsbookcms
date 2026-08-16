import assert from "node:assert/strict";
import test from "node:test";
import {
  OrderInputError,
  persistOrder,
  recordAbandonedOrder,
} from "./order-persistence.ts";

test("persistOrder returns the newly inserted order data", async () => {
  const mockDb = {
    prepare(sql: string) {
      const statementSql = sql;
      const stmt = {
        bind(..._args: unknown[]) {
          return stmt;
        },
        async first() {
          if (statementSql.includes("FROM product_variants")) {
            return { id: 101, price: 50000, stock: 10 };
          }
          if (statementSql.includes("FROM stores")) {
            return { id: 1, cod_fee_bearer: "buyer" };
          }
          if (statementSql.includes("SELECT MAX(id)")) {
            return { max_id: 17 };
          }
          return null;
        },
      };
      return stmt;
    },
    async batch(statements: unknown[]) {
      return statements.map((_, index) => ({
        results: index === statements.length - 1 ? [{ id: 18 }] : [],
      }));
    },
  } as unknown as D1Database;

  const result = await persistOrder(mockDb, {
    submitToken: "sb_test_123",
    customerName: "Paduka Ongki",
    customerPhone: "08123456789",
    address: "Jl. Merdeka No. 1",
    province: "Jawa Barat",
    city: "Bandung",
    district: "Coblong",
    variantKey: "101",
    quantity: 1,
    shippingCost: 10000,
    paymentMethod: "cod",
  });

  assert.equal(result.id, 18);
  assert.equal(result.orderNumber, "INV-10018");
  assert.equal(result.totalAmount, 60000 + Math.round(60000 * 0.03 * 1.11)); // COD fee applied
});

test("persistOrder promotes the recent abandoned row and replaces its items", async () => {
  type CapturedStatement = {
    sql: string;
    args: unknown[];
  };
  let batchStatements: CapturedStatement[] = [];
  const mockDb = {
    prepare(sql: string) {
      const captured: CapturedStatement = { sql, args: [] };
      const stmt = {
        captured,
        bind(...args: unknown[]) {
          captured.args = args;
          return stmt;
        },
        async first() {
          if (sql.includes("FROM product_variants")) {
            return { id: 101, price: 50000, stock: 10 };
          }
          if (sql.includes("FROM stores")) {
            return { id: 1, cod_fee_bearer: "buyer" };
          }
          if (
            sql.includes("FROM orders") &&
            sql.includes("shipping_status = 'abandoned'")
          ) {
            return {
              id: 7,
              order_number: "ABN-ORIGINAL",
              public_status_token: "status-original",
            };
          }
          throw new Error(`Unexpected first query: ${sql}`);
        },
      };
      return stmt;
    },
    async batch(statements: Array<{ captured: CapturedStatement }>) {
      batchStatements = statements.map((statement) => statement.captured);
      return batchStatements.map((_, index) => ({
        results:
          index === batchStatements.length - 1 ? [{ id: 7 }] : [],
      }));
    },
  } as unknown as D1Database;

  const result = await persistOrder(mockDb, {
    submitToken: "sb_promote_123456",
    customerName: "Paduka Ongki",
    customerPhone: "628123456789",
    customerEmail: "buyer@example.com",
    address: "Jl. Merdeka No. 1, Kota Bandung",
    province: "ID-JB",
    city: "Bandung",
    district: "Coblong",
    postalCode: "40132",
    variantKey: "101",
    quantity: 2,
    shippingCost: 10000,
    paymentMethod: "cod",
    warehouseId: 3,
    destinationAreaId: "area-40132",
    courierCode: "jne",
    courierService: "REG",
    adClickIds: '{"gclid":"click-123"}',
  });

  assert.equal(result.id, 7);
  assert.equal(result.orderNumber, "INV-10007");
  assert.equal(result.publicStatusToken, "status-original");
  assert.equal(batchStatements.length, 5);
  assert.match(batchStatements[0].sql, /^\s*UPDATE orders/);
  assert.match(batchStatements[0].sql, /shipping_status = 'pending'/);
  assert.match(batchStatements[0].sql, /ad_click_ids = COALESCE/);
  assert.ok(batchStatements[0].args.includes("sb_promote_123456"));
  assert.ok(batchStatements[0].args.includes('{"gclid":"click-123"}'));
  assert.ok(!batchStatements.some((statement) =>
    statement.sql.includes("INSERT INTO orders"),
  ));
  assert.match(batchStatements[1].sql, /DELETE FROM order_items/);
  assert.match(batchStatements[2].sql, /INSERT INTO order_items/);
});

test("recordAbandonedOrder normalizes an Indonesian phone and creates an unpaid abandoned row", async () => {
  type CapturedStatement = {
    sql: string;
    args: unknown[];
  };
  let batchStatements: CapturedStatement[] = [];
  const mockDb = {
    prepare(sql: string) {
      const captured: CapturedStatement = { sql, args: [] };
      const stmt = {
        captured,
        bind(...args: unknown[]) {
          captured.args = args;
          return stmt;
        },
        async first() {
          if (sql.includes("MAX(id)")) return { max_id: 100 };
          if (
            sql.includes("FROM orders") &&
            sql.includes("shipping_status = 'abandoned'")
          ) {
            return null;
          }
          if (sql.includes("SELECT id FROM stores")) return { id: 9 };
          throw new Error(`Unexpected first query: ${sql}`);
        },
      };
      return stmt;
    },
    async batch(statements: Array<{ captured: CapturedStatement }>) {
      batchStatements = statements.map((statement) => statement.captured);
      return batchStatements.map((_, index) => ({
        results:
          index === batchStatements.length - 1
            ? [{ id: 41, order_number: batchStatements[0].args[0] }]
            : [],
      }));
    },
  } as unknown as D1Database;

  const result = await recordAbandonedOrder(mockDb, {
    customerName: "Paduka Ongki",
    customerPhone: "08123456789",
    address: "Jl. Merdeka No. 1",
    province: "ID-JB",
    totalAmount: 50000,
    variantId: 101,
  });

  assert.equal(result.id, 41);
  assert.equal(result.customerPhone, "628123456789");
  assert.equal(result.action, "created");
  assert.match(batchStatements[0].sql, /'unpaid', 'abandoned'/);
  assert.ok(batchStatements[0].args.includes("628123456789"));
  assert.match(batchStatements[1].sql, /INSERT INTO order_items/);
});

test("recordAbandonedOrder upserts the matching recent lead", async () => {
  let updateSql = "";
  let updateArgs: unknown[] = [];
  let batchCalled = false;
  const mockDb = {
    prepare(sql: string) {
      const stmt = {
        bind(...args: unknown[]) {
          if (sql.includes("UPDATE orders")) updateArgs = args;
          return stmt;
        },
        async first() {
          return {
            id: 22,
            order_number: "ABN-EXISTING",
          };
        },
        async run() {
          updateSql = sql;
          return { success: true };
        },
      };
      return stmt;
    },
    async batch() {
      batchCalled = true;
      return [];
    },
  } as unknown as D1Database;

  const result = await recordAbandonedOrder(mockDb, {
    customerName: "Nama Terbaru",
    customerPhone: "+62 812-3456-789",
    totalAmount: 75000,
  });

  assert.equal(result.id, 22);
  assert.equal(result.orderNumber, "ABN-EXISTING");
  assert.equal(result.action, "updated");
  assert.equal(batchCalled, false);
  assert.match(updateSql, /payment_status = 'unpaid'/);
  assert.match(updateSql, /shipping_status = 'abandoned'/);
  assert.ok(updateArgs.includes(75000));
});

test("recordAbandonedOrder rejects a non-mobile Indonesian phone", async () => {
  const unusedDb = {} as D1Database;
  await assert.rejects(
    recordAbandonedOrder(unusedDb, {
      customerName: "Paduka Ongki",
      customerPhone: "0215551234",
    }),
    (error: unknown) =>
      error instanceof OrderInputError &&
      error.message === "Nomor WhatsApp tidak valid.",
  );
});
