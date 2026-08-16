CREATE TABLE `storefront_content` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`store_id` integer NOT NULL,
	`content_key` text NOT NULL,
	`content_type` text NOT NULL,
	`draft_json` text,
	`published_json` text,
	`version` integer DEFAULT 0 NOT NULL,
	`generated_by` text,
	`updated_at` text NOT NULL,
	`published_at` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storefront_content_content_key_unique` ON `storefront_content` (`content_key`);--> statement-breakpoint
ALTER TABLE `stores` ADD `ai_content_instructions` text;