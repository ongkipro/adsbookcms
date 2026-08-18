import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { GET } from "../pages/api/admin/analytics.ts";

type SqlValue = null | number | string | Uint8Array;

class TestStatement {
  private readonly database: DatabaseSync;
  private readonly sql: string;
  private readonly values: SqlValue[];

  constructor(
    database: DatabaseSync,
    sql: string,
    values: SqlValue[] = [],
  ) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values: SqlValue[]) {
    return new TestStatement(this.database, this.sql, values);
  }

  async first<T>() {
    return (this.database.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }

  async all<T>() {
    return {
      success: true,
      results: this.database.prepare(this.sql).all(...this.values) as T[],
      meta: { changes: 0, last_row_id: 0 },
    };
  }
}

function createAnalyticsDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      total_amount INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      payment_status TEXT NOT NULL,
      shipping_status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return {
    sqlite,
    d1: {
      prepare(sql: string) {
        return new TestStatement(sqlite, sql);
      },
    } as unknown as D1Database,
  };
}

test("admin analytics separates manual transfer from AutoLaris VA and excludes abandoned leads", async () => {
  const { sqlite, d1 } = createAnalyticsDatabase();
  const insert = sqlite.prepare(`
    INSERT INTO orders (id, total_amount, payment_method, payment_status, shipping_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  [
    [1, 100_000, "cod", "pending", "pending", "2026-08-17T18:00:00.000Z"],
    [2, 200_000, "manual_transfer", "pending", "pending", "2026-08-17T19:00:00.000Z"],
    [3, 300_000, "bank_transfer", "paid", "pending", "2026-08-17T20:00:00.000Z"],
    [4, 400_000, "qris", "paid", "pending", "2026-08-17T21:00:00.000Z"],
    [5, 900_000, "cod", "pending", "abandoned", "2026-08-17T22:00:00.000Z"],
  ].forEach((row) => insert.run(...row));

  const response = await GET({
    locals: { runtimeEnv: { OMS_DB: d1 } },
    url: new URL("https://cms.test/api/admin/analytics?startDate=2026-08-18&endDate=2026-08-18&interval=hour"),
  } as never);
  const payload = await response.json() as any;

  assert.equal(response.status, 200);
  assert.equal(payload.data.total_orders, 4);
  assert.equal(payload.data.total_revenue, 1_000_000);
  assert.deepEqual(payload.data.payment_methods, {
    total: 4,
    cod: { count: 1, percentage: 25 },
    manual_transfer: { count: 1, percentage: 25 },
    virtual_account: { count: 1, percentage: 25 },
    qris: { count: 1, percentage: 25 },
    unknown_count: 0,
  });
  assert.equal(payload.data.period.interval, "hour");
  assert.equal(payload.data.trends.reduce((sum: number, point: { orders: number }) => sum + point.orders, 0), 4);
});

test("admin analytics reports unknown methods and prevents truncated multi-day hourly output", async () => {
  const { sqlite, d1 } = createAnalyticsDatabase();
  sqlite.exec(`
    INSERT INTO orders VALUES
      (1, 100000, 'legacy_wallet', 'pending', 'pending', '2026-08-17T18:00:00.000Z'),
      (2, 100000, 'cod', 'pending', 'pending', '2026-08-18T18:00:00.000Z');
  `);

  const response = await GET({
    locals: { runtimeEnv: { OMS_DB: d1 } },
    url: new URL("https://cms.test/api/admin/analytics?startDate=2026-08-18&endDate=2026-08-19&interval=hour"),
  } as never);
  const payload = await response.json() as any;

  assert.equal(payload.data.payment_methods.unknown_count, 1);
  assert.equal(payload.data.period.interval, "day");
  assert.equal(payload.data.trends.length, 2);
});
