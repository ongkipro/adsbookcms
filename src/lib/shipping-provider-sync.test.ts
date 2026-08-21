import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import test from "node:test";

type QueryValue = null | number | string | Uint8Array;
type TestD1Result = {
  success: true;
  results: Record<string, unknown>[];
  meta: { changes: number; last_row_id: number };
};

class SqliteD1Statement {
  readonly #database: DatabaseSync;
  readonly #sql: string;
  readonly #values: QueryValue[];

  constructor(database: DatabaseSync, sql: string, values: QueryValue[] = []) {
    this.#database = database;
    this.#sql = sql;
    this.#values = values;
  }

  bind(...values: QueryValue[]) {
    return new SqliteD1Statement(this.#database, this.#sql, values);
  }

  async first<T>(): Promise<T | null> {
    return (this.#prepare().get(...this.#values) as T | undefined) ?? null;
  }

  async all<T>() {
    return {
      success: true as const,
      results: this.#prepare().all(...this.#values) as T[],
      meta: { changes: 0, last_row_id: 0 },
    };
  }

  async run() {
    return this.execute();
  }

  execute(): TestD1Result {
    if (/^\s*SELECT\b/i.test(this.#sql)) {
      return {
        success: true,
        results: this.#prepare().all(...this.#values) as Record<string, unknown>[],
        meta: { changes: 0, last_row_id: 0 },
      };
    }
    const execution = this.#prepare().run(...this.#values);
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(execution.changes),
        last_row_id: Number(execution.lastInsertRowid),
      },
    };
  }

  #prepare(): StatementSync {
    return this.#database.prepare(this.#sql);
  }
}

class ShippingSyncDatabase {
  readonly #database = new DatabaseSync(":memory:");

  constructor() {
    this.#database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE stores (
        id INTEGER PRIMARY KEY,
        mengantar_api_key TEXT,
        mengantar_base_url TEXT,
        autolaris_api_key TEXT,
        autolaris_base_url TEXT
      );
      CREATE TABLE product_variants (id INTEGER PRIMARY KEY, stock INTEGER);
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        order_number TEXT NOT NULL UNIQUE,
        payment_method TEXT NOT NULL,
        payment_status TEXT NOT NULL,
        shipping_status TEXT NOT NULL,
        courier_code TEXT,
        cnote_no TEXT,
        provider_order_id TEXT,
        stock_restored_at TEXT,
        provider_status_text TEXT,
        provider_status_at TEXT,
        provider_synced_at TEXT
      );
      CREATE TABLE order_items (
        id INTEGER PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        variant_id INTEGER NOT NULL REFERENCES product_variants(id),
        quantity INTEGER NOT NULL
      );
      INSERT INTO stores (
        id, mengantar_api_key, mengantar_base_url,
        autolaris_api_key, autolaris_base_url
      ) VALUES (1, 'test-key', 'https://provider.invalid', NULL, NULL);
      INSERT INTO product_variants (id, stock) VALUES (501, 8);
    `);
  }

  prepare(sql: string) {
    return new SqliteD1Statement(this.#database, sql);
  }

  async batch(statements: SqliteD1Statement[]) {
    this.#database.exec("BEGIN");
    try {
      const results = statements.map((statement) => statement.execute());
      this.#database.exec("COMMIT");
      return results;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  seedOrder(input: {
    id: number;
    status: string;
    cnoteNo: string;
    itemQuantity?: number;
  }) {
    this.#database
      .prepare(
        `INSERT INTO orders (
          id, order_number, payment_method, payment_status, shipping_status,
          courier_code, cnote_no, provider_order_id
        ) VALUES (?, ?, 'cod', 'unpaid', ?, 'JNE', ?, ?)`,
      )
      .run(
        input.id,
        `ORDER-${input.id}`,
        input.status,
        input.cnoteNo,
        `MGT-${input.id}`,
      );
    if (input.itemQuantity) {
      this.#database
        .prepare(
          "INSERT INTO order_items (id, order_id, variant_id, quantity) VALUES (?, ?, 501, ?)",
        )
        .run(input.id, input.id, input.itemQuantity);
    }
  }

  row<T>(sql: string, ...values: QueryValue[]): T {
    return this.#database.prepare(sql).get(...values) as T;
  }
}

const extensionResolver = registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const relativeWithoutExtension =
        specifier.startsWith(".") && !/\.[a-z0-9]+$/i.test(specifier);
      if (!relativeWithoutExtension) throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});
const shippingRoute = await import("../pages/api/admin/shipping.ts");
extensionResolver.deregister();

function invokeSync(database: ShippingSyncDatabase, orderIds: number[]) {
  return shippingRoute.PATCH({
    request: new Request("https://example.test/api/admin/shipping", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "sync-provider", orderIds }),
    }),
    locals: {
      admin: { id: "admin-1", role: "owner" },
      runtimeEnv: { OMS_DB: database as unknown as D1Database },
    },
  } as never);
}

test("provider sync is sequential and isolates a sibling provider failure", async () => {
  const database = new ShippingSyncDatabase();
  database.seedOrder({ id: 1, status: "processing", cnoteNo: "TRACK-1" });
  database.seedOrder({ id: 2, status: "processing", cnoteNo: "TRACK-2" });
  const originalFetch = globalThis.fetch;
  let activeRequests = 0;
  let maximumActiveRequests = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    activeRequests += 1;
    maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
    await Promise.resolve();
    try {
      if (String(input).includes("TRACK-2")) {
        return new Response(
          JSON.stringify({ success: false, message: "Tracking unavailable" }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              status: "{\"PICKED_UP\":true}",
              history: [
                {
                  date: "17-08-2026 11:00 Asia/Jakarta",
                  desc: "Paket telah dijemput kurir",
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } finally {
      activeRequests -= 1;
    }
  }) as typeof fetch;

  try {
    const response = await invokeSync(database, [1, 2]);
    const payload = (await response.json()) as {
      data: {
        synced: number;
        updated: number;
        unchanged: number;
        failed: number;
        results: Array<{ error: string | null }>;
      };
    };
    assert.equal(response.status, 200);
    assert.equal(maximumActiveRequests, 1);
    assert.deepEqual(
      {
        synced: payload.data.synced,
        updated: payload.data.updated,
        unchanged: payload.data.unchanged,
        failed: payload.data.failed,
      },
      { synced: 1, updated: 1, unchanged: 0, failed: 1 },
    );
    assert.equal(payload.data.results[0].error, null);
    assert.match(payload.data.results[1].error || "", /Tracking unavailable/);
    assert.deepEqual(
      {
        ...database.row<Record<string, unknown>>(
          `SELECT shipping_status, provider_status_text, provider_status_at,
            provider_synced_at IS NOT NULL AS has_sync
          FROM orders WHERE id = 1`,
        ),
      },
      {
        shipping_status: "shipped",
        provider_status_text: "Paket telah dijemput kurir",
        provider_status_at: "2026-08-17T04:00:00.000Z",
        has_sync: 1,
      },
    );
    assert.equal(
      database.row<{ shipping_status: string }>(
        "SELECT shipping_status FROM orders WHERE id = 2",
      ).shipping_status,
      "processing",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("RTS synchronization restores reserved stock exactly once", async () => {
  const database = new ShippingSyncDatabase();
  database.seedOrder({
    id: 3,
    status: "shipped",
    cnoteNo: "TRACK-RTS",
    itemQuantity: 2,
  });
  const originalFetch = globalThis.fetch;
  let providerStatus = "{\"RTS\":true}";
  let providerDescription = "Return to sender";
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        success: true,
        data: [
          {
            status: providerStatus,
            history: [
              {
                date: "17-08-2026 12:00 Asia/Jakarta",
                desc: providerDescription,
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;

  try {
    const firstResponse = await invokeSync(database, [3]);
    const firstPayload = (await firstResponse.json()) as {
      data: { synced: number; updated: number; unchanged: number; failed: number };
    };
    assert.equal(firstResponse.status, 200);
    assert.deepEqual(
      {
        synced: firstPayload.data.synced,
        updated: firstPayload.data.updated,
        unchanged: firstPayload.data.unchanged,
        failed: firstPayload.data.failed,
      },
      { synced: 1, updated: 1, unchanged: 0, failed: 0 },
    );
    assert.deepEqual(
      {
        ...database.row<Record<string, unknown>>(
          `SELECT shipping_status, stock_restored_at IS NOT NULL AS restored,
            provider_status_text
          FROM orders WHERE id = 3`,
        ),
      },
      {
        shipping_status: "returned",
        restored: 1,
        provider_status_text: "Return to sender",
      },
    );
    assert.equal(
      database.row<{ stock: number }>(
        "SELECT stock FROM product_variants WHERE id = 501",
      ).stock,
      10,
    );

    providerStatus = "{\"CREATED\":true}";
    providerDescription = "Order created";
    const repeatResponse = await invokeSync(database, [3]);
    const repeatPayload = (await repeatResponse.json()) as {
      data: { synced: number; updated: number; unchanged: number; failed: number };
    };
    assert.deepEqual(
      {
        synced: repeatPayload.data.synced,
        updated: repeatPayload.data.updated,
        unchanged: repeatPayload.data.unchanged,
        failed: repeatPayload.data.failed,
      },
      { synced: 1, updated: 0, unchanged: 1, failed: 0 },
    );
    assert.equal(
      database.row<{ stock: number }>(
        "SELECT stock FROM product_variants WHERE id = 501",
      ).stock,
      10,
    );
    assert.equal(
      database.row<{ shipping_status: string }>(
        "SELECT shipping_status FROM orders WHERE id = 3",
      ).shipping_status,
      "returned",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
