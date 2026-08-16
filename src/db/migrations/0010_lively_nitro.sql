CREATE TABLE `payment_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`provider` text DEFAULT 'autolaris' NOT NULL,
	`provider_transaction_id` text,
	`reference_id` text NOT NULL,
	`public_token` text NOT NULL,
	`channel_code` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`amount` integer NOT NULL,
	`admin_fee` integer DEFAULT 0 NOT NULL,
	`total_amount` integer NOT NULL,
	`virtual_account` text,
	`qr_payload` text,
	`payment_code` text,
	`provider_payment_url` text,
	`expires_at` text,
	`paid_at` text,
	`failed_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_transactions_provider_transaction_id_unique` ON `payment_transactions` (`provider_transaction_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_transactions_reference_id_unique` ON `payment_transactions` (`reference_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_transactions_public_token_unique` ON `payment_transactions` (`public_token`);--> statement-breakpoint
ALTER TABLE `orders` ADD `customer_email` text;