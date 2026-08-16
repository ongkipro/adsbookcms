ALTER TABLE `product_variants` ADD `scalev_variant_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `product_variants_scalev_variant_id_unique` ON `product_variants` (`scalev_variant_id`);--> statement-breakpoint
ALTER TABLE `products` ADD `scalev_product_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `products_scalev_product_id_unique` ON `products` (`scalev_product_id`);