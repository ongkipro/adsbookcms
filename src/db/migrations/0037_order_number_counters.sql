-- One atomic sequence serves both INV and ABN numbers. Sharing the suffix space
-- lets an abandoned order become completed by changing only its prefix without
-- colliding with an invoice allocated while the lead was still abandoned.
CREATE TABLE `order_number_counters` (
  `counter_name` text PRIMARY KEY NOT NULL,
  `last_value` integer NOT NULL CHECK (`last_value` >= 10000),
  `updated_at` text NOT NULL,
  CHECK (`counter_name` = 'orders')
);

-- Existing public numbers were generated as 10000 + orders.id. Seed from both
-- the row id and numeric suffix so upgrades cannot reuse a value even if a prior
-- allocator left a deliberate gap after a failed checkout.
INSERT INTO `order_number_counters` (`counter_name`, `last_value`, `updated_at`)
SELECT
  'orders',
  MAX(
    COALESCE(MAX(`id`) + 10000, 10000),
    COALESCE(MAX(
      CASE
        WHEN `order_number` GLOB 'INV-[0-9]*' OR `order_number` GLOB 'ABN-[0-9]*'
          THEN CAST(SUBSTR(`order_number`, 5) AS integer)
        ELSE 10000
      END
    ), 10000)
  ),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `orders`;
