CREATE TABLE `seller_bank_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`store_id` integer NOT NULL,
	`bank_code` text NOT NULL,
	`account_holder` text NOT NULL,
	`account_number` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `seller_bank_account_id` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `seller_bank_code` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `seller_bank_name` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `seller_account_holder` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `seller_account_number` text;