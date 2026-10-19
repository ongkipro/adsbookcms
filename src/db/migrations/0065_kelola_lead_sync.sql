-- Abandoned-order lead push to Kelola (src/lib/kelola-order-sync.ts). Its own
-- column, not `kelola_synced_at`: an abandoned row converts in place into the
-- completed order, which must still be pushed as a sale after its lead was.
ALTER TABLE `orders` ADD `kelola_lead_synced_at` text;
