DROP INDEX `product_variants_scalev_variant_id_unique`;--> statement-breakpoint
ALTER TABLE `product_variants` DROP COLUMN `scalev_variant_id`;--> statement-breakpoint
DROP INDEX `products_scalev_product_id_unique`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `scalev_product_id`;