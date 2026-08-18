-- Persist the latest Mengantar observation independently from the local order
-- lifecycle so provider freshness remains visible even when no transition occurs.
ALTER TABLE `orders` ADD `provider_status_text` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `provider_status_at` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `provider_synced_at` text;
