CREATE TABLE `courier_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`store_id` integer NOT NULL,
	`courier_code` text NOT NULL,
	`is_enabled` integer DEFAULT true,
	`is_cod_enabled` integer DEFAULT true,
	`excluded_provinces` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`variant_id` integer NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_number` text NOT NULL,
	`store_id` integer NOT NULL,
	`warehouse_id` integer,
	`pickup_schedule_id` integer,
	`customer_name` text NOT NULL,
	`customer_phone` text NOT NULL,
	`address` text NOT NULL,
	`province` text NOT NULL,
	`city` text NOT NULL,
	`district` text NOT NULL,
	`postal_code` text,
	`total_amount` integer NOT NULL,
	`shipping_cost` integer DEFAULT 0 NOT NULL,
	`discount_amount` integer DEFAULT 0,
	`payment_method` text DEFAULT 'cod' NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`shipping_status` text DEFAULT 'pending' NOT NULL,
	`courier_code` text,
	`courier_service` text,
	`cnote_no` text,
	`receiver_rts_score` integer,
	`rts_risk_label` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pickup_schedule_id`) REFERENCES `pickup_schedules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE TABLE `pickup_schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`warehouse_id` integer NOT NULL,
	`scheduled_at` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`shipment_count` integer DEFAULT 0 NOT NULL,
	`provider_reference` text,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`sku` text NOT NULL,
	`title` text NOT NULL,
	`price` integer NOT NULL,
	`compare_price` integer,
	`weight_grams` integer DEFAULT 1000 NOT NULL,
	`stock` integer DEFAULT 1000,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_variants_sku_unique` ON `product_variants` (`sku`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`store_id` integer NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`category` text DEFAULT 'Umum',
	`is_active` integer DEFAULT true,
	`created_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE TABLE `stores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`mengantar_api_key` text,
	`autolaris_api_key` text,
	`meta_pixel_id` text,
	`meta_capi_token` text,
	`google_ads_conversion_id` text,
	`google_ads_conversion_label` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stores_slug_unique` ON `stores` (`slug`);--> statement-breakpoint
CREATE TABLE `warehouses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`store_id` integer NOT NULL,
	`name` text NOT NULL,
	`origin_area_id` text NOT NULL,
	`pickup_address_id` text NOT NULL,
	`address` text NOT NULL,
	`city` text NOT NULL,
	`province` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
