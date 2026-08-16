CREATE TABLE `admin_credentials` (
	`id` integer PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`must_change_password` integer DEFAULT true NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_credentials_username_unique` ON `admin_credentials` (`username`);
--> statement-breakpoint
INSERT INTO `admin_credentials` (`id`, `username`, `password_hash`, `must_change_password`, `updated_at`)
VALUES (1, 'admin', 'pbkdf2-sha256$100000$-EwKzifD04qz0rRDZxAlpQ$Hq_4WkRnBcUgAASqRR0kukVbbGOZyN3IIxpvVfm6_l4', 1, '2026-08-07T00:00:00.000Z');