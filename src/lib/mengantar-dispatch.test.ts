import assert from "node:assert/strict";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import test from "node:test";
import { dispatchOrderToMengantar } from "./mengantar-dispatch.ts";

type QueryValue = null | number | string | Uint8Array;

class SqliteD1Statement {
  readonly #database: DatabaseSync;
  readonly #sql: string;
  readonly #values: QueryValue[];

  constructor(
    database: DatabaseSync,
    sql: string,
    values: QueryValue[] = [],
  ) {
    this.#database = database;
    this.#sql = sql;
    this.#values = values;
  }

  bind(...values: QueryValue[]) {
    return new SqliteD1Statement(this.#database, this.#sql, values);
  }

  async first<T>() {
    return (this.prepare().get(...this.#values) as T | undefined) ?? null;
  }

  async run() {
    const result = this.prepare().run(...this.#values);
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }

  private prepare(): StatementSync {
    return this.#database.prepare(this.#sql);
  }
}

class DispatchDatabase {
  readonly sqlite = new DatabaseSync(":memory:");

  constructor() {
    this.sqlite.exec(`
      CREATE TABLE stores (
        id INTEGER PRIMARY KEY,
        mengantar_api_key TEXT,
        mengantar_base_url TEXT,
        autolaris_api_key TEXT,
        autolaris_base_url TEXT
      );
      CREATE TABLE warehouses (
        id INTEGER PRIMARY KEY,
        pickup_address_id TEXT
      );
      CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL
      );
      CREATE TABLE product_variants (
        id INTEGER PRIMARY KEY,
        product_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        weight_grams INTEGER NOT NULL
      );
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        order_number TEXT NOT NULL,
        warehouse_id INTEGER,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        address TEXT NOT NULL,
        destination_area_id TEXT,
        courier_code TEXT,
        payment_method TEXT NOT NULL,
        payment_status TEXT NOT NULL,
        shipping_status TEXT NOT NULL,
        total_amount INTEGER NOT NULL,
        provider_order_id TEXT,
        provider_batch_id TEXT,
        cnote_no TEXT,
        provider_dispatch_error TEXT,
        provider_dispatch_claimed_at TEXT,
        provider_dispatched_at TEXT,
        confirmed_at TEXT
      );
      CREATE TABLE order_items (
        id INTEGER PRIMARY KEY,
        order_id INTEGER NOT NULL,
        variant_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price INTEGER NOT NULL
      );
      CREATE TABLE provider_dispatch_locks (
        provider TEXT PRIMARY KEY,
        lease_token TEXT,
        lease_expires_at TEXT,
        updated_at TEXT NOT NULL
      );

      INSERT INTO stores VALUES (
        1, 'test-mengantar-key', 'https://provider.test', NULL, NULL
      );
      INSERT INTO warehouses VALUES (1, 'pickup-1');
      INSERT INTO products VALUES (1, 'Produk Uji');
      INSERT INTO product_variants VALUES (1, 1, 'Default', 500);
      INSERT INTO orders VALUES (
        1, 'INV-TEST-1', 1, 'Siti Rahayu', '6281234567890',
        'Jl. Melati 10, Surabaya', 'destination-1', 'JNE',
        'cod', 'unpaid', 'pending', 168000,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL
      );
      INSERT INTO order_items VALUES (1, 1, 1, 1, 150000);
    `);
  }

  prepare(sql: string) {
    return new SqliteD1Statement(this.sqlite, sql);
  }
}

const acceptedResponse = () =>
  new Response(
    JSON.stringify({
      success: true,
      batch_id: "batch-1",
      data: [
        {
          _id: "provider-order-1",
          ORDER_ID: "MG-1",
          cnote_no: "RESI-1",
          isPaid: true,
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

const asD1 = (database: DispatchDatabase) =>
  database as unknown as D1Database;

const locals = { runtimeEnv: {} } as unknown as App.Locals;

test("explicit dispatch advances an unchanged eligible order", async (context) => {
  const database = new DispatchDatabase();
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => acceptedResponse();

  const outcome = await dispatchOrderToMengantar(asD1(database), locals, 1);
  const stored = database.sqlite
    .prepare(
      `SELECT shipping_status, provider_order_id, cnote_no,
        provider_dispatch_error, provider_dispatch_claimed_at
      FROM orders WHERE id = 1`,
    )
    .get() as Record<string, unknown>;

  assert.equal(outcome.status, "dispatched");
  assert.equal(stored.shipping_status, "processing");
  assert.equal(stored.provider_order_id, "provider-order-1");
  assert.equal(stored.cnote_no, "RESI-1");
  assert.equal(stored.provider_dispatch_error, null);
  assert.equal(stored.provider_dispatch_claimed_at, null);
});

test("provider acceptance cannot resurrect an order cancelled during dispatch", async (context) => {
  const database = new DispatchDatabase();
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => {
    database.sqlite
      .prepare("UPDATE orders SET shipping_status = 'cancelled' WHERE id = 1")
      .run();
    return acceptedResponse();
  };

  const outcome = await dispatchOrderToMengantar(asD1(database), locals, 1);
  const stored = database.sqlite
    .prepare(
      `SELECT shipping_status, provider_order_id, cnote_no,
        provider_dispatch_error, provider_dispatch_claimed_at
      FROM orders WHERE id = 1`,
    )
    .get() as Record<string, unknown>;

  assert.equal(outcome.status, "failed");
  assert.equal(outcome.providerOrderId, "provider-order-1");
  assert.equal(stored.shipping_status, "cancelled");
  assert.equal(stored.provider_order_id, "provider-order-1");
  assert.equal(stored.cnote_no, "RESI-1");
  assert.match(String(stored.provider_dispatch_error), /order berubah/i);
  assert.equal(stored.provider_dispatch_claimed_at, null);
});

test("provider acceptance cannot overwrite buyer data changed during dispatch", async (context) => {
  const database = new DispatchDatabase();
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => {
    database.sqlite
      .prepare("UPDATE orders SET address = 'Jl. Mawar 20, Surabaya' WHERE id = 1")
      .run();
    return acceptedResponse();
  };

  const outcome = await dispatchOrderToMengantar(asD1(database), locals, 1);
  const stored = database.sqlite
    .prepare(
      `SELECT address, shipping_status, provider_order_id,
        provider_dispatch_error, provider_dispatch_claimed_at
      FROM orders WHERE id = 1`,
    )
    .get() as Record<string, unknown>;

  assert.equal(outcome.status, "failed");
  assert.equal(stored.address, "Jl. Mawar 20, Surabaya");
  assert.equal(stored.shipping_status, "pending");
  assert.equal(stored.provider_order_id, "provider-order-1");
  assert.match(String(stored.provider_dispatch_error), /order berubah/i);
  assert.equal(stored.provider_dispatch_claimed_at, null);
});
