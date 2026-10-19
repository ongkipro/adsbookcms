/**
 * First-party plugins (ADR-028).
 *
 * A plugin is product code under `src/plugins/<id>/`, so every install carries
 * it and an update never conflicts on it. It is not "installed" on a store until
 * an owner or admin activates it at /admin/settings/plugins. Activation creates
 * the plugin's own tables and writes its `plugins` row. Until then the core
 * never calls it: no hook runs, no table exists, no admin panel shows.
 *
 * This is not a runtime for customer code (PRD non-goals). The list below is
 * compiled in, and a plugin follows the same conventions as the rest of the
 * product: D1, the shared admin shell, Indonesian UI copy, tests beside the code.
 */
import { getRuntimeEnv, type getEnvValue } from "../lib/env.ts";
import { kelolaPlugin } from "./kelola/index.ts";

type Env = Parameters<typeof getEnvValue>[1];

export type PluginContext = {
  database: D1Database;
  env: Env;
  /** The plugin's stored settings (`plugins.settings`), parsed. */
  settings: Record<string, unknown>;
};

export type Plugin = {
  id: string;
  name: string;
  description: string;
  /** Admin page that configures the plugin once it is active. */
  settingsHref: string;
  /**
   * The plugin's own schema, as ordered steps. Step `n` moves the plugin from
   * version `n` to `n + 1`. Statements must be idempotent (`IF NOT EXISTS`):
   * a step that half-ran is run again.
   */
  schema: readonly (readonly string[])[];
  /** Statements that remove the plugin's tables on uninstall. */
  uninstall: readonly string[];
  /** After checkout stores an order. Runs outside the buyer's response. */
  onOrderCreated?(context: PluginContext, orderId: number): Promise<unknown>;
  /** Inside the hourly cron. Returns a count for the cron summary. */
  onCron?(context: PluginContext, now: Date): Promise<number>;
};

export const PLUGINS: readonly Plugin[] = [kelolaPlugin];

export function findPlugin(id: string) {
  return PLUGINS.find((plugin) => plugin.id === id) ?? null;
}

type PluginRow = { id: string; enabled: number; schema_version: number; settings: string; activated_at: string | null };

function parseSettings(raw: string | null | undefined): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

async function readRows(database: D1Database): Promise<PluginRow[]> {
  const { results } = await database
    .prepare("SELECT id, enabled, schema_version, settings, activated_at FROM plugins")
    .all<PluginRow>()
    // A Worker serving before migration 0066 lands has no plugins table yet:
    // nothing is active, which is the safe answer.
    .catch(() => ({ results: [] as PluginRow[] }));
  return results;
}

/** Run the schema steps a plugin's row has not reached. */
async function upgradeSchema(database: D1Database, plugin: Plugin, from: number) {
  for (let step = from; step < plugin.schema.length; step += 1) {
    for (const statement of plugin.schema[step]) await database.prepare(statement).run();
    await database
      .prepare("UPDATE plugins SET schema_version = ?, updated_at = ? WHERE id = ?")
      .bind(step + 1, new Date().toISOString(), plugin.id)
      .run();
  }
}

/**
 * The active plugins with their settings, schema brought up to date. A plugin
 * whose upgrade fails is left out of this run rather than breaking the caller.
 */
export async function activePlugins(database: D1Database, env: Env) {
  const active: Array<{ plugin: Plugin; context: PluginContext }> = [];
  for (const row of await readRows(database)) {
    const plugin = findPlugin(row.id);
    if (!plugin || !row.enabled) continue;
    try {
      if (row.schema_version < plugin.schema.length) await upgradeSchema(database, plugin, row.schema_version);
      active.push({ plugin, context: { database, env, settings: parseSettings(row.settings) } });
    } catch (error) {
      console.error("plugin-schema-upgrade-failed", { plugin: plugin.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return active;
}

export async function pluginContext(database: D1Database, env: Env, id: string) {
  return (await activePlugins(database, env)).find((entry) => entry.plugin.id === id)?.context ?? null;
}

/** What /admin/settings/plugins lists: every compiled-in plugin and its state. */
export async function listPlugins(database: D1Database) {
  const rows = new Map((await readRows(database)).map((row) => [row.id, row]));
  return PLUGINS.map((plugin) => {
    const row = rows.get(plugin.id);
    return {
      id: plugin.id,
      name: plugin.name,
      description: plugin.description,
      settings_href: plugin.settingsHref,
      installed: Boolean(row),
      enabled: Boolean(row?.enabled),
      activated_at: row?.activated_at ?? null,
    };
  });
}

/** Activate: create the plugin's tables, then mark it enabled. */
export async function activatePlugin(database: D1Database, id: string) {
  const plugin = findPlugin(id);
  if (!plugin) return false;
  const now = new Date().toISOString();
  await database
    .prepare(
      `INSERT INTO plugins (id, enabled, schema_version, settings, activated_at, updated_at)
       VALUES (?, 0, 0, '{}', ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(id, now, now)
    .run();
  const row = await database.prepare("SELECT schema_version FROM plugins WHERE id = ?").bind(id).first<{ schema_version: number }>();
  await upgradeSchema(database, plugin, row?.schema_version ?? 0);
  await database
    .prepare("UPDATE plugins SET enabled = 1, activated_at = COALESCE(activated_at, ?), updated_at = ? WHERE id = ?")
    .bind(now, now, id)
    .run();
  return true;
}

/** Deactivate: hooks stop; tables, settings and history stay for a re-activation. */
export async function deactivatePlugin(database: D1Database, id: string) {
  if (!findPlugin(id)) return false;
  await database.prepare("UPDATE plugins SET enabled = 0, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
  return true;
}

/** Uninstall: drop the plugin's tables and forget its settings. Not reversible. */
export async function uninstallPlugin(database: D1Database, id: string) {
  const plugin = findPlugin(id);
  if (!plugin) return false;
  for (const statement of plugin.uninstall) await database.prepare(statement).run();
  await database.prepare("DELETE FROM plugins WHERE id = ?").bind(id).run();
  return true;
}

export async function savePluginSettings(database: D1Database, id: string, settings: Record<string, unknown>) {
  await database
    .prepare("UPDATE plugins SET settings = ?, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(settings), new Date().toISOString(), id)
    .run();
}

/** Checkout leg: every active plugin's order hook, without delaying the buyer. */
export function scheduleOrderCreated(database: D1Database, orderId: number, locals?: App.Locals) {
  const task = (async () => {
    const env = getRuntimeEnv(locals);
    for (const { plugin, context } of await activePlugins(database, env)) {
      if (!plugin.onOrderCreated) continue;
      await plugin.onOrderCreated(context, orderId).catch((error) =>
        console.error("plugin-order-hook-failed", { plugin: plugin.id, orderId, error: error instanceof Error ? error.message : String(error) }),
      );
    }
  })().catch((error) => console.error("plugin-order-hook-failed", { orderId, error }));
  if (locals?.cfContext) locals.cfContext.waitUntil(task);
  else void task;
}

/** Cron leg: every active plugin's hourly work, one failure isolated from the rest. */
export async function runPluginCron(database: D1Database, env: Env, now: Date) {
  const counts: Record<string, number> = {};
  for (const { plugin, context } of await activePlugins(database, env)) {
    if (!plugin.onCron) continue;
    try {
      counts[plugin.id] = await plugin.onCron(context, now);
    } catch (error) {
      console.error("plugin-cron-failed", { plugin: plugin.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return counts;
}
