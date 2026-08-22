-- Operator notifications for revenue events (A19).
--
-- One row per (event type, order). A missed-order lead is an `orders` row with
-- `shipping_status = 'abandoned'`, so `order_id` addresses all three event
-- types and the unique index is what enforces exactly-once — checkout retries,
-- replayed submits, and a payment confirmed twice all collapse to one row
-- without the caller having to remember anything.
--
-- `title` and `body` are stored rather than derived at read time on purpose:
-- a notification records what was true when the event happened, and the order
-- it points at can still be edited afterwards (an operator correcting a
-- kecamatan, for instance). Deriving would silently rewrite history and would
-- put a join on every list read.
-- No `store_id`: one installer is one Worker is one store (ADR-001), so it
-- would be a column with one value forever. `order_id` already ties the event
-- to the only store there is.
CREATE TABLE `notifications` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `type` text NOT NULL CHECK (`type` IN ('order', 'lead', 'payment')),
  `order_id` integer NOT NULL,
  -- The admin order route is keyed by invoice number, not id, so the link
  -- target is stored with the event instead of costing a join per list read.
  `order_number` text NOT NULL,
  `title` text NOT NULL CHECK (length(trim(`title`)) BETWEEN 1 AND 160),
  `body` text NOT NULL CHECK (length(trim(`body`)) BETWEEN 1 AND 500),
  `created_at` text NOT NULL,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_event_unique`
  ON `notifications` (`type`, `order_id`);
--> statement-breakpoint
-- Read state is per operator so one person clearing the badge does not blind
-- the rest of the team. Deleting a notification takes its read rows with it.
CREATE TABLE `notification_reads` (
  `notification_id` integer NOT NULL,
  `operator_username` text NOT NULL,
  `read_at` text NOT NULL,
  PRIMARY KEY (`notification_id`, `operator_username`),
  FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE cascade
);
