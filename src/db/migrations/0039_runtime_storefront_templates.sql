-- Runtime storefront templates are constrained declarative definitions. Stored
-- configuration selects existing composition primitives; it never contains HTML,
-- JavaScript, or executable plugin code.
CREATE TABLE `storefront_templates` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `store_id` integer NOT NULL,
  `template_id` text NOT NULL,
  `definition_json` text NOT NULL,
  `created_at` text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `storefront_templates_store_id_template_id_unique`
  ON `storefront_templates` (`store_id`, `template_id`);
