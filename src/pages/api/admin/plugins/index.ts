import type { APIRoute } from "astro";
import { jsonError, jsonOk } from "../../../../lib/api.ts";
import { getRuntimeEnv } from "../../../../lib/env.ts";
import { activatePlugin, deactivatePlugin, findPlugin, listPlugins, uninstallPlugin } from "../../../../plugins/registry.ts";

export const prerender = false;

function database(locals: App.Locals) {
  const db = getRuntimeEnv(locals)?.OMS_DB;
  return db && typeof db === "object" ? (db as D1Database) : null;
}

/** Every compiled-in plugin and whether this store has activated it (ADR-028). */
export const GET: APIRoute = async ({ locals }) => {
  const db = database(locals);
  if (!db) return jsonError("Database belum tersedia.", 503);
  return jsonOk({ data: { plugins: await listPlugins(db) } });
};

/** Activate, deactivate or uninstall one plugin. Owner only, like credentials. */
export const POST: APIRoute = async ({ request, locals }) => {
  const db = database(locals);
  if (!db) return jsonError("Database belum tersedia.", 503);
  if (locals.admin?.role !== "owner") return jsonError("Hanya owner yang dapat mengatur plugin.", 403);
  const body = (await request.json().catch(() => null)) as { id?: unknown; action?: unknown } | null;
  const plugin = typeof body?.id === "string" ? findPlugin(body.id) : null;
  if (!plugin) return jsonError("Plugin tidak dikenal.", 404);
  try {
    if (body?.action === "activate") await activatePlugin(db, plugin.id);
    else if (body?.action === "deactivate") await deactivatePlugin(db, plugin.id);
    else if (body?.action === "uninstall") await uninstallPlugin(db, plugin.id);
    else return jsonError("Aksi plugin tidak valid.", 400);
  } catch (error) {
    console.error("plugin-action-failed", { plugin: plugin.id, action: body?.action, error });
    return jsonError(`Gagal mengubah plugin ${plugin.name}.`, 500);
  }
  const message = body.action === "activate"
    ? `${plugin.name} aktif.`
    : body.action === "deactivate"
      ? `${plugin.name} dinonaktifkan. Data dan pengaturannya tetap tersimpan.`
      : `${plugin.name} dihapus beserta datanya.`;
  return jsonOk({ message, data: { plugins: await listPlugins(db) } });
};
