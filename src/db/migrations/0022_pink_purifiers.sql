ALTER TABLE `orders` ADD `cod_service_fee` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `cod_service_fee_vat` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `cod_fee_bearer` text DEFAULT 'buyer' NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `cod_fee_bearer` text DEFAULT 'buyer' NOT NULL;