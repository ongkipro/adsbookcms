ALTER TABLE `developer_api_keys` ADD COLUMN `scopes` text NOT NULL DEFAULT 'storefront:read,catalog:read,shipping:read,checkout:write,orders:read,tracking:write';
--> statement-breakpoint
ALTER TABLE `developer_api_keys` ADD COLUMN `rate_limit_per_minute` integer NOT NULL DEFAULT 120 CHECK (`rate_limit_per_minute` BETWEEN 1 AND 600);
--> statement-breakpoint
ALTER TABLE `developer_api_keys` ADD COLUMN `daily_quota` integer NOT NULL DEFAULT 10000 CHECK (`daily_quota` BETWEEN 1 AND 100000);
--> statement-breakpoint
CREATE TABLE `developer_api_key_usage` (
	`api_key_id` integer NOT NULL,
	`bucket_kind` text NOT NULL CHECK (`bucket_kind` IN ('minute', 'day')),
	`bucket_start` text NOT NULL,
	`request_count` integer NOT NULL DEFAULT 0 CHECK (`request_count` >= 0),
	PRIMARY KEY (`api_key_id`, `bucket_kind`, `bucket_start`),
	FOREIGN KEY (`api_key_id`) REFERENCES `developer_api_keys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `developer_api_key_usage_bucket_idx` ON `developer_api_key_usage` (`bucket_kind`,`bucket_start`);
--> statement-breakpoint
CREATE TABLE `headless_api_audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`api_key_id` integer NOT NULL,
	`operation` text NOT NULL,
	`outcome` text NOT NULL CHECK (`outcome` IN ('allowed', 'scope_denied', 'rate_limited', 'quota_exhausted', 'origin_denied')),
	`status_code` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`api_key_id`) REFERENCES `developer_api_keys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `headless_api_audit_events_created_idx` ON `headless_api_audit_events` (`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `headless_api_audit_events_key_created_idx` ON `headless_api_audit_events` (`api_key_id`,`created_at`);
