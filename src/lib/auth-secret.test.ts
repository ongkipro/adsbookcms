import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { resolveAuthSecret } from "./auth-secret.ts";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../db/migrations/0058_install_secrets.sql", import.meta.url), "utf8"));
  const d1 = {
    prepare: (sql: string) => {
      let bound: unknown[] = [];
      const statement = {
        bind: (...values: unknown[]) => {
          bound = values;
          return statement;
        },
        first: async () => sqlite.prepare(sql).get(...(bound as never[])) ?? null,
        run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...(bound as never[])).changes) } }),
      };
      return statement;
    },
  } as unknown as D1Database;
  return { sqlite, d1 };
}

test("a configured AUTH_SECRET wins and nothing is written", async () => {
  const { sqlite, d1 } = database();
  const configured = "c".repeat(40);
  assert.equal(await resolveAuthSecret({ AUTH_SECRET: configured }, d1), configured);
  assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM install_secrets").get() as { n: number }).n, 0);
});

test("without one, the Worker generates a strong key once and every caller agrees on it", async () => {
  const first = database();
  const [a, b] = await Promise.all([resolveAuthSecret({}, first.d1), resolveAuthSecret({}, first.d1)]);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, b);
  assert.equal((first.sqlite.prepare("SELECT COUNT(*) AS n FROM install_secrets").get() as { n: number }).n, 1);

  // A different install gets a different key: nothing is shared or derived.
  const second = database();
  assert.notEqual(await resolveAuthSecret({}, second.d1), a);
});

test("a short env value is not a key, and an unreadable table fails closed", async () => {
  const { d1 } = database();
  assert.equal((await resolveAuthSecret({ AUTH_SECRET: "too-short" }, d1)).length, 64);
  const broken = {
    prepare: () => {
      throw new Error("D1 unavailable");
    },
  } as unknown as D1Database;
  assert.equal(await resolveAuthSecret({}, broken), "");
});
