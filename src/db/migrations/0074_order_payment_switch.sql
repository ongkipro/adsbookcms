-- A buyer may move an unshipped COD order to a prepaid method from the invoice
-- page (src/lib/payment-switch.ts). The order keeps where it came from and
-- when, so the operator can see that the sale was booked as COD (a Kelola push
-- already sent keeps saying COD; Kelola has no update route) and when it
-- stopped being one.
ALTER TABLE `orders` ADD COLUMN `payment_switched_from` text;
--> statement-breakpoint
ALTER TABLE `orders` ADD COLUMN `payment_switched_at` text;
