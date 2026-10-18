-- Kelola CRM webhook pair, set from /admin/profile. D1 wins over the
-- KELOLA_ORDER_WEBHOOK_URL / _SECRET env pair, like the other provider
-- credentials. The secret is never returned through a browser API.
ALTER TABLE `stores` ADD `kelola_webhook_url` text;--> statement-breakpoint
ALTER TABLE `stores` ADD `kelola_webhook_secret` text;
