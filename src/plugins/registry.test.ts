import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { splitMigrationStatements } from "../lib/schema-version.ts";
import { activatePlugin, deactivatePlugin, listPlugins, runPluginCron, scheduleOrderCreated, uninstallPlugin } from "./registry.ts";
import { POST as pluginAction } from "../pages/api/admin/plugins/index.ts";

/** The checked-in chain up to (not including) `stop`, as a D1-shaped handle. */
function store(stop = "￿") {
  const sqlite = new DatabaseSync(":memory:");
  const dir = new URL("../db/migrations/", import.meta.url);
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".sql") && file < stop).sort()) {
    for (const statement of splitMigrationStatements(readFileSync(new URL(name, dir), "utf8"))) sqlite.exec(statement);
  }
  sqlite.exec(`INSERT INTO stores (id, name, slug, created_at) VALUES (1, 'Toko', 'toko', '2026-01-01')`);
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
  const table = (name: string) => Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
  return { sqlite, database, table };
}

const env = { KELOLA_ORDER_WEBHOOK_URL: "https://kelola.test/api/public/toko/order/twh_env", KELOLA_ORDER_WEBHOOK_SECRET: "envsecret-0123456789" };

test("a store that never activates a plugin carries none of it, and its hooks never run", async (context) => {
  const { database, table } = store();
  const realFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = realFetch; });
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; return new Response("{}", { status: 201 }); }) as typeof fetch;

  assert.equal(table("plugin_kelola_orders"), false);
  assert.deepEqual((await listPlugins(database)).map(({ id, installed, enabled }) => ({ id, installed, enabled })), [
    { id: "kelola", installed: false, enabled: false },
  ]);
  // Even with the env pair present, an inactive plugin sends nothing.
  assert.deepEqual(await runPluginCron(database, env, new Date()), {});
  scheduleOrderCreated(database, 1, { runtimeEnv: { OMS_DB: database, ...env } } as never);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls, 0);
});

test("activate creates the plugin's table; deactivate keeps it; uninstall removes it", async () => {
  const { sqlite, database, table } = store();
  assert.equal(await activatePlugin(database, "kelola"), true);
  assert.equal(table("plugin_kelola_orders"), true);
  assert.deepEqual({ ...sqlite.prepare("SELECT enabled, schema_version FROM plugins WHERE id = 'kelola'").get() }, { enabled: 1, schema_version: 1 });
  // Active with no pair: the cron leg runs and does nothing.
  assert.deepEqual(await runPluginCron(database, {}, new Date()), { kelola: 0 });

  await deactivatePlugin(database, "kelola");
  assert.deepEqual(await runPluginCron(database, env, new Date()), {});
  assert.equal(table("plugin_kelola_orders"), true, "data survives a deactivation");
  assert.equal(await activatePlugin(database, "kelola"), true, "re-activation is idempotent");

  await uninstallPlugin(database, "kelola");
  assert.equal(table("plugin_kelola_orders"), false);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM plugins").get()?.n, 0);
  assert.equal(await activatePlugin(database, "nope"), false);
});

test("only the owner changes plugins through the API", async () => {
  const { database, table } = store();
  const call = (role: string, body: unknown) => pluginAction({
    request: new Request("https://store.test/api/admin/plugins", { method: "POST", body: JSON.stringify(body) }),
    locals: { admin: { username: "u", role, mustChangePassword: false }, runtimeEnv: { OMS_DB: database } },
  } as never);
  assert.equal((await call("admin", { id: "kelola", action: "activate" })).status, 403);
  assert.equal(table("plugin_kelola_orders"), false);
  assert.equal((await call("owner", { id: "unknown", action: "activate" })).status, 404);
  assert.equal((await call("owner", { id: "kelola", action: "explode" })).status, 400);
  const ok = await call("owner", { id: "kelola", action: "activate" });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).data.plugins[0].enabled, true);
});

test("migration 0066 turns a saved Kelola pair into an active plugin and drops the core columns", () => {
  const { sqlite } = store("0066");
  sqlite.exec("UPDATE stores SET kelola_webhook_url = 'https://kelola.test/api/public/toko/order/twh_kept', kelola_webhook_secret = 'kept-secret-0123456789'");
  const dir = new URL("../db/migrations/", import.meta.url);
  for (const statement of splitMigrationStatements(readFileSync(new URL("0066_plugins.sql", dir), "utf8"))) sqlite.exec(statement);
  const row = sqlite.prepare("SELECT enabled, settings FROM plugins WHERE id = 'kelola'").get() as { enabled: number; settings: string };
  assert.equal(row.enabled, 1);
  assert.deepEqual(JSON.parse(row.settings), { webhook_url: "https://kelola.test/api/public/toko/order/twh_kept", webhook_secret: "kept-secret-0123456789" });
  const columns = (table: string) => (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  assert.equal(columns("orders").some((name) => name.startsWith("kelola_")), false);
  assert.equal(columns("stores").some((name) => name.startsWith("kelola_")), false);
  assert.ok(columns("orders").includes("source_page_path"), "attribution stays core");
});
