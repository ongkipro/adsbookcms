-- ZvaraShop owns its migration namespace after ADR-024. Keep the merchant's
-- real catalog copy beside the product so Google and Meta do not receive a
-- synthetic description or a store name when a product has its own brand.
ALTER TABLE products ADD COLUMN brand TEXT;
--> statement-breakpoint
ALTER TABLE products ADD COLUMN description TEXT;
