-- A landing page may take over its product's page (A21).
--
-- When claimed, the landing page stops being a second URL and becomes the
-- product URL: `/produk/<product-slug>` renders it, and its own
-- `/<landing-slug>` redirects there. One live URL, so the two can never
-- compete for the same product as duplicate content.
--
-- The partial unique index is what makes "one landing page per product page"
-- an invariant rather than a rule the admin has to remember: an unclaimed page
-- is not in the index at all, so any number of drafts can point at the same
-- product, but only one of them can claim it.
ALTER TABLE `landing_pages`
  ADD `is_product_page` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `landing_pages_product_page_unique`
  ON `landing_pages` (`product_id`)
  WHERE `is_product_page` = 1;
