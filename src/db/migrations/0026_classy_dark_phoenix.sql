CREATE TABLE `capi_event_outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`event_name` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`last_error` text,
	`next_retry_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `capi_event_outbox_event_id_unique` ON `capi_event_outbox` (`event_id`);--> statement-breakpoint
CREATE INDEX `capi_event_outbox_due_idx` ON `capi_event_outbox` (`status`,`next_retry_at`);