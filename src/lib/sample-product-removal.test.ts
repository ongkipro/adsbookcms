import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

// Guards of migration 0034: only the untouched foreign sample from 0017 is
// removed, never a row the merchant has edited and never a row an order
// references. Re-running must stay a no-op.
const MIGRATION = readFileSync(
  new URL("../db/migrations/0034_remove_foreign_sample_product.sql", import.meta.url),
  "utf8",
);

const SCHEMA = `
  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    category TEXT,
    is_active INTEGER DEFAULT 1,
    image_url TEXT,
    created_at TEXT NOT NULL DEFAULT '2026-08-01T00:00:00.000Z'
  );
  CREATE TABLE product_variants (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    sku TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    price INTEGER NOT NULL,
    compare_price INTEGER,
    weight_grams INTEGER NOT NULL DEFAULT 1000,
    stock INTEGER DEFAULT 1000
  );
  CREATE TABLE orders (id INTEGER PRIMARY KEY);
  CREATE TABLE order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price INTEGER NOT NULL
  );
`;

// Exactly what migration 0017 seeds, plus one unrelated merchant product.
const SEED_0017 = `
  INSERT INTO products (id, title, slug, category, image_url)
  VALUES (10001, 'Aussie Sample', 'aussie', 'Aussie Sawit Ganoderma', '/images/aussie.webp');
  INSERT INTO product_variants (id, product_id, sku, title, price, compare_price, weight_grams, stock)
  VALUES (20001, 10001, 'AUS-500ML', '500ml', 150000, 229000, 600, 350),
         (20002, 10001, 'AUS-1L', '1 Liter', 300000, 349000, 1100, 180);
  INSERT INTO products (id, title, slug) VALUES (1, 'ZIVIA Tote Bag', 'zivia-tote-bag');
  INSERT INTO product_variants (id, product_id, sku, title, price)
  VALUES (1, 1, 'SKU-ZIVIA-BLK', 'Warna Black', 128500);
`;

function createDatabase(seed = SEED_0017) {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(SCHEMA);
  database.exec(seed);
  return database;
}

function countRows(database: DatabaseSync) {
  const product = database
    .prepare("SELECT count(*) AS total FROM products WHERE id = 10001")
    .get() as { total: number };
  const variants = database
    .prepare("SELECT count(*) AS total FROM product_variants WHERE product_id = 10001")
    .get() as { total: number };
  return { product: product.total, variants: variants.total };
}

test("0034 removes the untouched foreign sample and nothing else", () => {
  const database = createDatabase();
  database.exec(MIGRATION);

  assert.deepEqual(countRows(database), { product: 0, variants: 0 });
  const survivors = (
    database.prepare("SELECT id FROM products ORDER BY id").all() as { id: number }[]
  ).map((row) => row.id);
  assert.deepEqual(survivors, [1]);
});

test("0034 is a no-op when re-run or when the row was never present", () => {
  const database = createDatabase();
  database.exec(MIGRATION);
  database.exec(MIGRATION);
  assert.deepEqual(countRows(database), { product: 0, variants: 0 });

  const fresh = createDatabase(
    "INSERT INTO products (id, title, slug) VALUES (1, 'ZIVIA Tote Bag', 'zivia-tote-bag');",
  );
  fresh.exec(MIGRATION);
  assert.equal(
    (fresh.prepare("SELECT count(*) AS total FROM products").get() as { total: number })
      .total,
    1,
  );
});

test("0034 leaves product 10001 alone once the merchant has edited it", () => {
  for (const edit of [
    "UPDATE products SET title = 'My Own Product' WHERE id = 10001;",
    "UPDATE products SET slug = 'my-own-product' WHERE id = 10001;",
  ]) {
    const database = createDatabase();
    database.exec(edit);
    database.exec(MIGRATION);
    assert.deepEqual(countRows(database), { product: 1, variants: 2 }, edit);
  }
});

test("0034 leaves product 10001 alone when an order references it", () => {
  const database = createDatabase();
  database.exec(`
    INSERT INTO orders (id) VALUES (1);
    INSERT INTO order_items (id, order_id, variant_id, quantity, unit_price)
    VALUES (1, 1, 20002, 1, 300000);
  `);
  database.exec(MIGRATION);

  assert.deepEqual(countRows(database), { product: 1, variants: 2 });
});
