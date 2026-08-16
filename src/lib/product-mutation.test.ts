import assert from "node:assert/strict";
import test from "node:test";
import { deleteCatalogProduct } from "./product-mutation.ts";

type MockStatement = {
  sql: string;
  args: unknown[];
  bind: (...args: unknown[]) => MockStatement;
  first: () => Promise<unknown>;
};

function createDatabase(options: { exists: boolean; referenceCount: number }) {
  const batches: MockStatement[][] = [];
  const database = {
    prepare(sql: string) {
      const statement: MockStatement = {
        sql,
        args: [],
        bind(...args: unknown[]) {
          statement.args = args;
          return statement;
        },
        async first() {
          if (sql.includes("SELECT id FROM products")) {
            return options.exists ? { id: statement.args[0] } : null;
          }
          return null;
        },
      };
      return statement;
    },
    async batch(statements: MockStatement[]) {
      batches.push(statements);
      return statements.map((_, index) => ({
        success: true,
        results: [],
        meta: {
          changes:
            index === 1 && options.referenceCount === 0 ? 1 : 0,
        },
      }));
    },
  } as unknown as D1Database;
  return { database, batches };
}

test("no product id is exempt from deletion", async () => {
  // 10001 used to be an un-deletable "canonical sample". It is an ordinary
  // product now: the same delete path and the same order-reference guard apply.
  const { database, batches } = createDatabase({
    exists: true,
    referenceCount: 0,
  });

  assert.deepEqual(await deleteCatalogProduct(database, 10001), {
    status: "deleted",
  });
  assert.equal(batches.length, 1);
});

test("product deletion rejects products referenced by orders", async () => {
  const { database, batches } = createDatabase({
    exists: true,
    referenceCount: 2,
  });

  assert.deepEqual(await deleteCatalogProduct(database, 10002), {
    status: "referenced",
  });
  assert.equal(batches.length, 1);
  assert.match(batches[0][0].sql, /NOT EXISTS/);
  assert.match(batches[0][1].sql, /NOT EXISTS/);
});

test("product deletion removes variants before an unreferenced product", async () => {
  const { database, batches } = createDatabase({
    exists: true,
    referenceCount: 0,
  });

  assert.deepEqual(await deleteCatalogProduct(database, 10002), {
    status: "deleted",
  });
  assert.equal(batches.length, 1);
  assert.match(batches[0][0].sql, /DELETE FROM product_variants/);
  assert.match(batches[0][1].sql, /DELETE FROM products/);
  assert.deepEqual(batches[0].map((statement) => statement.args), [
    [10002, 10002],
    [10002, 10002],
  ]);
});

test("product deletion reports a missing product without writes", async () => {
  const { database, batches } = createDatabase({
    exists: false,
    referenceCount: 0,
  });

  assert.deepEqual(await deleteCatalogProduct(database, 10002), {
    status: "not_found",
  });
  assert.equal(batches.length, 0);
});
