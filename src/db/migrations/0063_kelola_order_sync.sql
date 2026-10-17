-- Order push to the Kelola CRM (src/lib/kelola-order-sync.ts). NULL synced_at
-- means not yet accepted by Kelola; the hourly cron retries inside a window.
ALTER TABLE `orders` ADD `kelola_synced_at` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `kelola_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `kelola_last_error` text;
