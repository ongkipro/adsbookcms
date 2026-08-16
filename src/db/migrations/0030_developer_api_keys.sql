CREATE TABLE `developer_api_keys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`key_preview` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	`revoked_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `developer_api_keys_key_hash_unique` ON `developer_api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `developer_api_keys_active_created_idx` ON `developer_api_keys` (`revoked_at`,`created_at`);--> statement-breakpoint