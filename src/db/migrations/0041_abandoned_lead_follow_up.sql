-- Keep storefront drop-offs separate from operational orders while preserving
-- the follow-up outcome after a lead is explicitly converted.
ALTER TABLE `orders` ADD `lead_follow_up_status` text DEFAULT 'new' NOT NULL
  CHECK (`lead_follow_up_status` IN ('new', 'contacted', 'qualified', 'not_interested', 'converted'));--> statement-breakpoint
ALTER TABLE `orders` ADD `lead_followed_up_at` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `lead_follow_up_note` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `lead_followed_up_by` text;--> statement-breakpoint
CREATE INDEX `orders_abandoned_follow_up_idx`
  ON `orders` (`shipping_status`, `lead_follow_up_status`, `created_at`);
