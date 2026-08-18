import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { DEFAULT_COURIER_RULES } from "./install.ts";
import { GET as listExpeditions } from "../pages/api/admin/expeditions.ts";

function databaseBeforeCourierBootstrap() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE stores (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      cod_disabled_province_codes TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE courier_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      courier_code TEXT NOT NULL,
      is_enabled INTEGER DEFAULT 1,
      is_cod_enabled INTEGER DEFAULT 1,
      excluded_provinces TEXT
    );
    CREATE TABLE warehouses (
      id INTEGER PRIMARY KEY,
      store_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      origin_area_id TEXT NOT NULL,
      origin_label TEXT,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      province TEXT NOT NULL
    );
  `);
  return database;
}

const migration = readFileSync(
  new URL("../db/migrations/0042_default_courier_rules.sql", import.meta.url),
  "utf8",
);

test("courier bootstrap repairs an installed store only when its policy is empty", () => {
  const database = databaseBeforeCourierBootstrap();
  database.exec(`
    INSERT INTO stores (id, name, slug, created_at) VALUES
      (1, 'Empty Store', 'empty', '2026-08-18T00:00:00.000Z'),
      (2, 'Configured Store', 'configured', '2026-08-18T00:00:00.000Z');
    INSERT INTO courier_rules (
      store_id, courier_code, is_enabled, is_cod_enabled, excluded_provinces
    ) VALUES (2, 'JNE', 0, 0, 'custom-policy');
  `);

  database.exec(migration);

  const repaired = database
    .prepare(`
      SELECT courier_code AS code, is_enabled AS enabled, is_cod_enabled AS cod
      FROM courier_rules WHERE store_id = 1 ORDER BY id
    `)
    .all()
    .map((row) => ({ ...row })) as Array<{
      code: string;
      enabled: number;
      cod: number;
    }>;
  assert.deepEqual(
    repaired,
    DEFAULT_COURIER_RULES.map((rule) => ({
      code: rule.code,
      enabled: 1,
      cod: rule.cod,
    })),
  );

  const configured = database
    .prepare(`
      SELECT courier_code AS code, is_enabled AS enabled,
             is_cod_enabled AS cod, excluded_provinces AS excluded
      FROM courier_rules WHERE store_id = 2
    `)
    .all()
    .map((row) => ({ ...row }));
  assert.deepEqual(configured, [
    { code: "JNE", enabled: 0, cod: 0, excluded: "custom-policy" },
  ]);

  database.exec(migration);
  const counts = database
    .prepare("SELECT store_id, COUNT(*) AS total FROM courier_rules GROUP BY store_id ORDER BY store_id")
    .all()
    .map((row) => ({ ...row }));
  assert.deepEqual(counts, [
    { store_id: 1, total: DEFAULT_COURIER_RULES.length },
    { store_id: 2, total: 1 },
  ]);
});

test("the Expeditions API exposes the repaired catalogue after upgrade", async () => {
  const database = databaseBeforeCourierBootstrap();
  database.exec(`
    INSERT INTO stores (id, name, slug, created_at)
    VALUES (1, 'Installed Store', 'installed', '2026-08-18T00:00:00.000Z');
  `);
  database.exec(migration);

  const binding = {
    prepare(sql: string) {
      return {
        async all<T>() {
          return { results: database.prepare(sql).all() as T[] };
        },
        async first<T>() {
          return database.prepare(sql).get() as T | null;
        },
      };
    },
  } as unknown as D1Database;

  const response = await listExpeditions({
    locals: { runtimeEnv: { OMS_DB: binding } },
  } as never);
  const payload = (await response.json()) as {
    success: boolean;
    data: { couriers: Array<{ courierCode: string; isEnabled: number; isCodEnabled: number }> };
  };

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.deepEqual(
    payload.data.couriers.map((courier) => ({
      code: courier.courierCode,
      enabled: courier.isEnabled,
      cod: courier.isCodEnabled,
    })),
    [...DEFAULT_COURIER_RULES]
      .sort((left, right) => left.code.localeCompare(right.code))
      .map((rule) => ({ code: rule.code, enabled: 1, cod: rule.cod })),
  );
});
