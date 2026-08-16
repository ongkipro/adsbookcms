-- Store identity moves into the database (ADR-003, gap G1).
--
-- Until now, a store's name, canonical URL, description, logo, tagline, theme
-- colour, locale and storefront template were baked into the bundle by
-- `astro build` from PUBLIC_SITE_* variables. Consequences: renaming a store
-- required a rebuild, `stores.name` and the storefront name were two different
-- values that could disagree, and one build could serve exactly one store —
-- which is what blocks the install wizard (ADR-004) and distorts the install
-- topology question (A-50).
--
-- Every column is nullable on purpose. A NULL means "not configured here", and
-- the resolver falls back to the environment value for that single field. That
-- is what lets an existing install keep working unchanged after this migration,
-- and what lets a brand-new database render before the install wizard has run.
--
-- `name` and `slug` already exist on `stores` and are not redefined.

ALTER TABLE `stores` ADD `site_url` text;
ALTER TABLE `stores` ADD `description` text;
ALTER TABLE `stores` ADD `logo` text;
ALTER TABLE `stores` ADD `tagline` text;
ALTER TABLE `stores` ADD `theme_color` text;
ALTER TABLE `stores` ADD `locale` text;
ALTER TABLE `stores` ADD `storefront_template` text;
ALTER TABLE `stores` ADD `admin_name` text;
