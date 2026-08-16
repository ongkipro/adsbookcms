ALTER TABLE `admin_credentials` ADD `display_name` text;--> statement-breakpoint
ALTER TABLE `admin_credentials` ADD `email` text;--> statement-breakpoint
ALTER TABLE `admin_credentials` ADD `role` text DEFAULT 'owner' NOT NULL;