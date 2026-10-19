-- First-party plugins (ADR-028, src/plugins/registry.ts). One row per plugin a
-- store has activated; no row means never activated. A plugin's own tables are
-- created by the plugin when it is activated, never by this chain, so a store
-- that does not use a plugin carries none of its schema.
CREATE TABLE `plugins` (
  `id` text PRIMARY KEY NOT NULL,
  `enabled` integer DEFAULT 0 NOT NULL,
  `schema_version` integer DEFAULT 0 NOT NULL,
  `settings` text DEFAULT '{}' NOT NULL,
  `activated_at` text,
  `updated_at` text NOT NULL
);--> statement-breakpoint
-- Kelola moves from core columns (0063-0065) into its plugin. A pair saved
-- from the dashboard before this migration becomes an active plugin with the
-- same settings; nothing else held data (no store had paired Kelola).
INSERT INTO `plugins` (`id`, `enabled`, `schema_version`, `settings`, `activated_at`, `updated_at`)
SELECT 'kelola', 1, 0,
       json_object('webhook_url', `kelola_webhook_url`, 'webhook_secret', `kelola_webhook_secret`),
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `stores`
WHERE `kelola_webhook_url` IS NOT NULL AND `kelola_webhook_secret` IS NOT NULL
ORDER BY `id` LIMIT 1;--> statement-breakpoint
ALTER TABLE `stores` DROP COLUMN `kelola_webhook_url`;--> statement-breakpoint
ALTER TABLE `stores` DROP COLUMN `kelola_webhook_secret`;--> statement-breakpoint
ALTER TABLE `orders` DROP COLUMN `kelola_synced_at`;--> statement-breakpoint
ALTER TABLE `orders` DROP COLUMN `kelola_attempts`;--> statement-breakpoint
ALTER TABLE `orders` DROP COLUMN `kelola_last_error`;--> statement-breakpoint
ALTER TABLE `orders` DROP COLUMN `kelola_lead_synced_at`;
