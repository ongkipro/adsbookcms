ALTER TABLE `orders` ADD `submit_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_submit_token_unique` ON `orders` (`submit_token`);
--> statement-breakpoint
CREATE TRIGGER `product_variants_stock_nonnegative`
BEFORE UPDATE OF `stock` ON `product_variants`
WHEN NEW.`stock` < 0
BEGIN
  SELECT RAISE(ABORT, 'INSUFFICIENT_STOCK');
END;