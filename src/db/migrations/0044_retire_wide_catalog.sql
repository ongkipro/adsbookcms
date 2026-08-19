-- Retires the `wide-catalog` storefront template (ADR-018).
--
-- The layout is gone from the schema, so a store still pointing at it, or a
-- runtime definition still declaring `layout: "wide"`, would fail validation on
-- the next request and take the home page to its unavailable state. This moves
-- them to `compact-market` before that can happen.
--
-- Idempotent: re-running matches nothing. It never touches a store that already
-- points somewhere valid, and it never invents a template for a store that has
-- none — `compact-market` is the built-in default the resolver falls back to.
UPDATE `stores`
SET `storefront_template` = 'compact-market'
WHERE `storefront_template` = 'wide-catalog';
--> statement-breakpoint
DELETE FROM `storefront_templates`
WHERE `template_id` = 'wide-catalog'
   OR REPLACE(REPLACE(`definition_json`, ' ', ''), '''', '"') LIKE '%"layout":"wide"%';
