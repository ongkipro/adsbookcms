CREATE TABLE `provider_dispatch_locks` (
	`provider` text PRIMARY KEY NOT NULL,
	`lease_token` text,
	`lease_expires_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `public_status_token` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `provider_dispatch_claimed_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_public_status_token_unique` ON `orders` (`public_status_token`);