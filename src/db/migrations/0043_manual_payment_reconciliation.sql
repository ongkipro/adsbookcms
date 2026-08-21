-- Manual AutoLaris confirmations are financial approvals. Keep one immutable
-- evidence row per payment transaction and let the unique constraint enforce
-- exactly-once confirmation across concurrent operator requests.
CREATE TABLE `payment_reconciliation_audits` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `store_id` integer NOT NULL,
  `payment_transaction_id` integer NOT NULL,
  `order_id` integer NOT NULL,
  `actor_admin_id` integer NOT NULL,
  `actor_username` text NOT NULL,
  `actor_role` text NOT NULL CHECK (`actor_role` IN ('owner', 'admin')),
  `provider` text DEFAULT 'autolaris' NOT NULL CHECK (`provider` = 'autolaris'),
  `provider_transaction_id` text NOT NULL,
  `reference_id` text NOT NULL,
  `previous_transaction_status` text NOT NULL,
  `previous_order_payment_status` text NOT NULL,
  `recorded_amount` integer NOT NULL CHECK (`recorded_amount` > 0),
  `recorded_admin_fee` integer NOT NULL CHECK (`recorded_admin_fee` >= 0),
  `recorded_total_amount` integer NOT NULL CHECK (`recorded_total_amount` > 0),
  `note` text NOT NULL CHECK (length(trim(`note`)) BETWEEN 5 AND 500),
  `confirmed_at` text NOT NULL,
  FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`payment_transaction_id`) REFERENCES `payment_transactions`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_reconciliation_audits_transaction_unique`
  ON `payment_reconciliation_audits` (`payment_transaction_id`);
--> statement-breakpoint
CREATE INDEX `payment_reconciliation_audits_store_confirmed_idx`
  ON `payment_reconciliation_audits` (`store_id`, `confirmed_at`);
--> statement-breakpoint
CREATE TRIGGER `payment_reconciliation_audits_no_update`
BEFORE UPDATE ON `payment_reconciliation_audits`
BEGIN
  SELECT RAISE(ABORT, 'payment reconciliation audits are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `payment_reconciliation_audits_no_delete`
BEFORE DELETE ON `payment_reconciliation_audits`
BEGIN
  SELECT RAISE(ABORT, 'payment reconciliation audits are append-only');
END;
