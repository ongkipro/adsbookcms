/**
 * Kelola CRM plugin (ADR-028). Pushes every new order to Kelola's Penjualan and
 * abandoned orders to its lead inbox. The work itself lives in `sync.ts`; this
 * file is what the registry sees.
 */
import type { Plugin } from "../registry.ts";
import { drainKelolaLeads, drainKelolaOrders, getKelolaConfig, pushOrderToKelola } from "./sync.ts";

export const kelolaPlugin: Plugin = {
  id: "kelola",
  name: "Kelola CRM",
  description: "Kirim setiap order baru ke Penjualan Kelola dan pesanan tertinggal ke Data tertinggal untuk di-follow up CS.",
  settingsHref: "/admin/settings/plugins/kelola",
  schema: [
    [
      // One row per order the plugin has touched. No foreign key: the plugin
      // must never block the core from deleting an order; orphans are harmless.
      `CREATE TABLE IF NOT EXISTS plugin_kelola_orders (
         order_id INTEGER PRIMARY KEY NOT NULL,
         synced_at TEXT,
         attempts INTEGER DEFAULT 0 NOT NULL,
         last_error TEXT,
         lead_synced_at TEXT
       )`,
    ],
  ],
  uninstall: ["DROP TABLE IF EXISTS plugin_kelola_orders"],
  async onOrderCreated({ database, env, settings }, orderId) {
    const config = getKelolaConfig(settings, env);
    return config ? pushOrderToKelola(database, config, orderId) : false;
  },
  async onCron({ database, env, settings }, now) {
    const config = getKelolaConfig(settings, env);
    if (!config) return 0;
    // Retry leg for orders checkout already tried once, then abandoned orders,
    // which reach Kelola only here, as leads for CS follow-up.
    return (await drainKelolaOrders(database, config, now)) + (await drainKelolaLeads(database, config, now));
  },
};
