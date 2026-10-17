import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { splitMigrationStatements } from "./schema-version.ts";
import {
  drainKelolaOrders,
  kelolaOrderPayload,
  pushOrderToKelola,
  readKelolaConfig,
  signKelolaBody,
} from "./kelola-order-sync.ts";

const config = { url: "https://kelola.test/api/public/toko/order/twh_x", secret: "testsecret" };

test("signature matches Kelola's verifier (its Mengantar test vector)", async () => {
  const body = '{"cnote_no":"JNE1234567890","order_id":"ORD-000123","courier":"JNE","status_category":"DELIVERED"}';
  assert.equal(
    await signKelolaBody("testsecret", "1787548800000", body),
    "05826dec707ea7164801d952cb7eaf7ce9adc0c8aa0b93366480434164a1a111",
  );
});

test("config needs both URL and secret", () => {
  assert.equal(readKelolaConfig({ KELOLA_ORDER_WEBHOOK_URL: config.url }), null);
  assert.deepEqual(
    readKelolaConfig({ KELOLA_ORDER_WEBHOOK_URL: config.url, KELOLA_ORDER_WEBHOOK_SECRET: "s" }),
    { url: config.url, secret: "s" },
  );
});

test("payload: COD carries the collected total, transfer does not; date is the WIB day", () => {
  const order = {
    id: 1, order_number: "INV-1", created_at: "2026-10-17T18:30:00.000Z", customer_name: "Budi",
    customer_phone: "081234567890", address: "Jl. Melati 1", province: "Jawa Barat", city: "Bandung",
    district: "Coblong", postal_code: null, shipping_cost: 15000, discount_amount: null,
    total_amount: 121000, payment_method: "cod",
  };
  const items = [{ sku: "GEL-1", name: "Gel", quantity: 2, unit_price: 52500, weight_grams: 150 }];
  const cod = kelolaOrderPayload(order, items);
  assert.equal(cod.date, "2026-10-18");
  assert.equal(cod.payment, "cod");
  assert.equal(cod.codValue, 121000);
  assert.equal(cod.berat, 300);
  assert.deepEqual(cod.items, [{ sku: "GEL-1", name: "Gel", qty: 2, price: 52500 }]);
  const qris = kelolaOrderPayload({ ...order, payment_method: "qris" }, items);
  assert.equal(qris.payment, "transfer");
  assert.equal(qris.codValue, null);
});

test("push marks the order synced; a failure is recorded and retried by the drain", async () => {
  const { sqlite, database } = migratedStore();
  const orderId = insertOrder(sqlite, "INV-20261017-0001", new Date().toISOString());
  const calls: { headers: Headers; body: string }[] = [];
  let status = 503;
  const fetcher = (async (_url: string, init: RequestInit) => {
    calls.push({ headers: new Headers(init.headers), body: String(init.body) });
    return new Response(status === 201 ? '{"ok":true}' : "down", { status });
  }) as unknown as typeof fetch;

  assert.equal(await pushOrderToKelola(database, config, orderId, fetcher), false);
  let row = sqlite.prepare("SELECT kelola_synced_at, kelola_attempts, kelola_last_error FROM orders WHERE id = ?").get(orderId) as Record<string, unknown>;
  assert.equal(row.kelola_synced_at, null);
  assert.equal(row.kelola_attempts, 1);
  assert.match(String(row.kelola_last_error), /HTTP 503/);

  status = 201;
  assert.equal(await drainKelolaOrders(database, config, new Date(), fetcher), 1);
  row = sqlite.prepare("SELECT kelola_synced_at, kelola_last_error FROM orders WHERE id = ?").get(orderId) as Record<string, unknown>;
  assert.ok(row.kelola_synced_at);
  assert.equal(row.kelola_last_error, null);

  const sent = calls[1];
  assert.equal(
    sent.headers.get("x-signature"),
    await signKelolaBody(config.secret, sent.headers.get("x-timestamp")!, sent.body),
  );
  assert.equal(JSON.parse(sent.body).code, "INV-20261017-0001");

  // Synced orders are never sent again.
  assert.equal(await drainKelolaOrders(database, config, new Date(), fetcher), 0);
  assert.equal(calls.length, 2);
});

test("drain skips abandoned, voided and out-of-window orders", async () => {
  const { sqlite, database } = migratedStore();
  const now = new Date();
  const abandoned = insertOrder(sqlite, "ABD-1", now.toISOString());
  sqlite.prepare("UPDATE orders SET shipping_status = 'abandoned' WHERE id = ?").run(abandoned);
  const voided = insertOrder(sqlite, "INV-2", now.toISOString());
  sqlite.prepare("UPDATE orders SET stock_restored_at = ? WHERE id = ?").run(now.toISOString(), voided);
  insertOrder(sqlite, "INV-3", new Date(now.getTime() - 25 * 3_600_000).toISOString());
  let calls = 0;
  const fetcher = (async () => { calls += 1; return new Response("{}", { status: 201 }); }) as unknown as typeof fetch;
  assert.equal(await drainKelolaOrders(database, config, now, fetcher), 0);
  assert.equal(calls, 0);
});

/** The full checked-in migration chain, so the test breaks if the columns drift. */
function migratedStore() {
  const sqlite = new DatabaseSync(":memory:");
  const dir = new URL("../db/migrations/", import.meta.url);
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".sql")).sort()) {
    for (const statement of splitMigrationStatements(readFileSync(new URL(name, dir), "utf8"))) {
      sqlite.exec(statement);
    }
  }
  sqlite.exec(`INSERT INTO stores (id, name, slug, created_at) VALUES (1, 'Toko', 'toko', '2026-01-01')`);
  sqlite.exec(`INSERT INTO products (id, store_id, title, slug, created_at) VALUES (1, 1, 'Gel Tenggorokan', 'gel', '2026-01-01')`);
  sqlite.exec(`INSERT INTO product_variants (id, product_id, sku, title, price, weight_grams) VALUES (1, 1, 'GEL-1', 'Gel Tenggorokan', 52500, 150)`);
  const database = {
    prepare: (sql: string) => {
      const bound: unknown[] = [];
      const statement = {
        bind: (...values: unknown[]) => { bound.push(...values); return statement; },
        run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...bound as never[]).changes) } }),
        first: async () => sqlite.prepare(sql).get(...bound as never[]) ?? null,
        all: async () => ({ results: sqlite.prepare(sql).all(...bound as never[]) }),
      };
      return statement;
    },
  } as unknown as D1Database;
  return { sqlite, database };
}

function insertOrder(sqlite: DatabaseSync, orderNumber: string, createdAt: string) {
  const { lastInsertRowid } = sqlite
    .prepare(
      `INSERT INTO orders (order_number, store_id, customer_name, customer_phone, address, province, city,
         district, total_amount, shipping_cost, payment_method, payment_status, shipping_status, created_at)
       VALUES (?, 1, 'Budi', '081234567890', 'Jl. Melati 1', 'Jawa Barat', 'Bandung', 'Coblong',
         120000, 15000, 'cod', 'unpaid', 'pending', ?)`,
    )
    .run(orderNumber, createdAt);
  sqlite.prepare("INSERT INTO order_items (order_id, variant_id, quantity, unit_price) VALUES (?, 1, 2, 52500)").run(lastInsertRowid);
  return Number(lastInsertRowid);
}
