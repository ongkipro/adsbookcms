-- Remove the foreign "canonical sample product" seeded by migration 0017.
--
-- 0017 inserted product 10001 as 'Aussie Sample' (slug 'aussie', an agriculture
-- product inherited from a previous merchant) plus variants 20001/20002, and the
-- admin API refused to edit or delete it. AdsBookCMS ships the bundled demo
-- catalog as its sample data instead, which is neutral, ours, and deletable
-- (ADR-006). The immutability guard is gone from the application; this removes
-- the row it protected. Editing 0017 in place would not help installs that have
-- already applied it, so the correction ships forward.
--
-- Guards:
--   1. Identity check. Both `slug` and `title` must still match exactly what
--      0017 wrote. A merchant who renamed, re-slugged, or replaced product 10001
--      keeps their data untouched.
--   2. Order safety. Nothing is removed while any `order_items` row references
--      one of its variants, so the order_items -> product_variants foreign key
--      cannot break and order history stays intact.
--   3. Idempotence. Every statement is a `DELETE ... WHERE`, so a database where
--      the row was never present or already removed is unaffected, and re-running
--      is harmless.

DELETE FROM product_variants
WHERE product_id = 10001
  AND EXISTS (
    SELECT 1
    FROM products
    WHERE id = 10001
      AND slug = 'aussie'
      AND title = 'Aussie Sample'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM order_items oi
    INNER JOIN product_variants referenced
      ON referenced.id = oi.variant_id
    WHERE referenced.product_id = 10001
  );

DELETE FROM products
WHERE id = 10001
  AND slug = 'aussie'
  AND title = 'Aussie Sample'
  AND NOT EXISTS (
    SELECT 1 FROM product_variants WHERE product_id = 10001
  );
