-- Durable Google Ads offline conversion delivery.
--
-- This outbox is separate from Meta CAPI because Google uses a different
-- destination, authentication model, retry contract, and deduplication key.
-- The payload contains click attribution and business data only; OAuth and
-- developer credentials remain Worker secrets.
CREATE TABLE `google_ads_conversion_outbox` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `order_id` integer NOT NULL,
  `order_number` text NOT NULL,
  `qualification` text NOT NULL CHECK (`qualification` IN ('online_paid', 'cod_delivered')),
  `payload` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL CHECK (`status` IN ('pending', 'sent', 'failed')),
  `attempts` integer DEFAULT 0 NOT NULL,
  `max_attempts` integer DEFAULT 5 NOT NULL,
  `last_error` text,
  `next_retry_at` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `google_ads_conversion_outbox_order_unique`
  ON `google_ads_conversion_outbox` (`order_id`);
CREATE INDEX `google_ads_conversion_outbox_due_idx`
  ON `google_ads_conversion_outbox` (`status`, `next_retry_at`);
