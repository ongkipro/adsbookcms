// `/admin/orders` server-renders its first rows under the filters a deep link
// carries, and they are the rows the list API returns for the request the
// OrdersTable island makes from the same link. Runs the real list route against
// the migration chain in SQLite.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { initialOrderListWhere } from "./admin-orders-initial.ts";
import { persistOrder } from "./order-persistence.ts";
import { splitMigrationStatements } from "./schema-version.ts";
import { SOURCE_SLUG_NONE_FILTER } from "./source-slug.ts";

// Routes import their siblings without an extension, as Astro allows.
const extensionResolver = registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith(".") || /\.[a-z0-9]+$/i.test(specifier)) throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});
const { GET: listRoute } = await import("../pages/api/admin/orders/index.ts");
extensionResolver.deregister();

type Value = null | number | string;

function openDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const name of readdirSync(directory).filter((file) => file.endsWith(".sql")).sort()) {
    for (const statement of splitMigrationStatements(readFileSync(new URL(name, directory), "utf8"))) {
      sqlite.exec(statement);
    }
  }
  sqlite.exec(`
    INSERT INTO stores (id, name, slug, created_at) VALUES (1, 'Toko Uji', 'toko-uji', '2026-10-29T00:00:00.000Z');
    INSERT INTO warehouses (id, store_id, name, origin_area_id, pickup_address_id, address, city, province)
    VALUES (1, 1, 'Gudang', 'origin-1', 'pickup-1', 'Jl. Gudang 1', 'Surabaya', 'ID-JI');
    INSERT INTO products (id, store_id, title, slug, created_at)
    VALUES (10001, 1, 'Produk Uji', 'produk-uji', '2026-10-29T00:00:00.000Z');
    INSERT INTO product_variants (id, product_id, sku, title, price, weight_grams)
    VALUES (20001, 10001, 'UJI-1', '500 gr', 50000, 500);
  `);
  const statement = (sql: string, values: Value[] = []) => ({
    bind: (...next: Value[]) => statement(sql, next.map((value) => value ?? null)),
    async first<T>() {
      return (sqlite.prepare(sql).get(...values) as T | undefined) ?? null;
    },
    async all<T>() {
      return { results: sqlite.prepare(sql).all(...values) as T[] };
    },
    async run() {
      const result = sqlite.prepare(sql).run(...values);
      return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
    },
    execute() {
      const prepared = sqlite.prepare(sql);
      if (/^\s*(SELECT|WITH)/i.test(sql) || /RETURNING/i.test(sql)) {
        return { success: true, results: prepared.all(...values), meta: { changes: 0 } };
      }
      const result = prepared.run(...values);
      return { success: true, results: [], meta: { changes: Number(result.changes) } };
    },
  });
  const d1 = {
    prepare: (sql: string) => statement(sql),
    async batch(statements: Array<ReturnType<typeof statement>>) {
      return statements.map((item) => item.execute());
    },
  } as unknown as D1Database;
  return { sqlite, d1 };
}

async function seed() {
  const { sqlite, d1 } = openDatabase();
  const rows: Array<[name: string, status: string, slug: string | null]> = [
    ["Budi Santoso", "pending", "promo-a"],
    ["Siti Rahayu", "processing", "promo-a"],
    ["Budi Hartono", "processing", "promo-b"],
    ["Rina Wati", "cancelled", null],
    ["Agus Salim", "pending", null],
  ];
  for (const [index, [name, status, slug]] of rows.entries()) {
    const order = await persistOrder(d1, {
      submitToken: `initial-list-${index}`,
      customerName: name,
      customerPhone: `628123456780${index}`,
      address: "Jl. Melati 10",
      province: "ID-JI",
      city: "Surabaya",
      district: "Wonokromo",
      variantKey: "20001",
      quantity: 1,
      shippingCost: 18000,
      paymentMethod: "cod",
      warehouseId: 1,
      destinationAreaId: "area-surabaya",
      courierCode: "JNE",
      courierService: "REG",
    });
    sqlite
      .prepare("UPDATE orders SET shipping_status = ?, source_page_path = ?, rts_risk_label = 'LOW' WHERE id = ?")
      .run(status, slug && `/lp/${slug}`, order.id);
  }
  // A lead is never an order row on this page.
  sqlite.prepare("UPDATE orders SET shipping_status = 'abandoned' WHERE customer_name = 'Agus Salim'").run();
  return { sqlite, d1 };
}

/** The request OrdersTable makes on first load, from the page's query. */
function islandRequest(pageQuery: URLSearchParams) {
  const query = new URLSearchParams({ page: "1", limit: "20" });
  const search = (pageQuery.get("search") || "").trim();
  if (search) query.set("search", search);
  const status = pageQuery.get("status") || pageQuery.get("shipping_status") || "all";
  if (status !== "all") query.set("shipping_status", status);
  const slug = pageQuery.get("source_slug") || "all";
  if (slug !== "all") query.set("source_slug", slug);
  return query;
}

for (const link of [
  "",
  "?source_slug=promo-a",
  `?source_slug=${SOURCE_SLUG_NONE_FILTER}`,
  "?source_slug=unknown-page",
  "?search=Budi",
  "?status=processing",
  "?shipping_status=cancelled",
  "?search=budi&status=processing&source_slug=promo-b",
]) {
  test(`the server's first rows match the list API for /admin/orders${link || " (no filter)"}`, async () => {
    const { sqlite, d1 } = await seed();
    const pageQuery = new URL(`https://toko.test/admin/orders${link}`).searchParams;
    const where = initialOrderListWhere(pageQuery);
    const server = (
      sqlite.prepare(`SELECT id FROM orders WHERE ${where.sql} ORDER BY orders.id DESC LIMIT 20`).all(...where.params) as Array<{ id: number }>
    ).map((row) => Number(row.id));

    const url = new URL(`https://toko.test/api/admin/orders?${islandRequest(pageQuery)}`);
    const response = await listRoute({ url, request: new Request(url), locals: { runtimeEnv: { OMS_DB: d1 } } } as never);
    const payload = (await response.json()) as { success: boolean; data: Array<{ id: number }> };
    assert.equal(payload.success, true);
    const api = payload.data.map((row) => Number(row.id));

    assert.deepEqual(server, api);
    if (link) assert.ok(server.length < 4, "a filtered link never paints every order");
  });
}
