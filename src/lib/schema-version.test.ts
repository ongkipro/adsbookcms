import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import {
  compareSchemaVersion,
  getSchemaVersionStatus,
  readAppliedMigrationCount,
} from "./schema-version.ts";
import { CMS_VERSION } from "./version.ts";

function countingDatabase(applied: number) {
  let queries = 0;
  const database = {
    prepare(sql: string) {
      queries += 1;
      assert.match(sql, /FROM d1_migrations/);
      return { first: async () => ({ applied }) };
    },
  } as unknown as D1Database;
  return { database, queries: () => queries };
}

// Runs first on purpose: getSchemaVersionStatus caches per isolate, so this is
// the only test that may observe the uncached path.
test("the applied count is read at most once per isolate", async () => {
  const { database, queries } = countingDatabase(CMS_VERSION.schemaVersion);
  const locals = {
    runtimeEnv: { OMS_DB: database },
  } as unknown as App.Locals;

  const first = await getSchemaVersionStatus(locals);
  const second = await getSchemaVersionStatus(locals);

  assert.equal(first.state, "match");
  assert.deepEqual(second, first);
  assert.equal(queries(), 1);
});

test("a drift between the declared and applied schema is reported, not thrown", () => {
  assert.deepEqual(compareSchemaVersion(36, 36), {
    state: "match",
    expected: 36,
    applied: 36,
  });
  assert.deepEqual(compareSchemaVersion(36, 34), {
    state: "database-behind",
    expected: 36,
    applied: 34,
  });
  assert.deepEqual(compareSchemaVersion(36, 37), {
    state: "database-ahead",
    expected: 36,
    applied: 37,
  });
});

test("an unreadable applied count degrades to unknown", async () => {
  for (const applied of [null, Number.NaN, -1, 1.5]) {
    assert.equal(compareSchemaVersion(36, applied).state, "unknown");
  }

  const brokenDatabase = {
    prepare() {
      throw new Error("no such table: d1_migrations");
    },
  } as unknown as D1Database;
  assert.equal(await readAppliedMigrationCount(brokenDatabase), null);
});

// The expected value cannot be counted at runtime — a Worker bundle has no
// filesystem — so the declared constant is the contract. This test is what
// keeps it honest: adding a migration without bumping schemaVersion fails CI.
test("CMS_VERSION.schemaVersion matches the migration chain on disk", () => {
  const files = readdirSync(new URL("../db/migrations/", import.meta.url))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  assert.equal(files.length, CMS_VERSION.schemaVersion);
  files.forEach((name, index) => {
    assert.equal(
      name.slice(0, 4),
      String(index).padStart(4, "0"),
      `migration chain has a gap or duplicate at ${name}`,
    );
  });
});
