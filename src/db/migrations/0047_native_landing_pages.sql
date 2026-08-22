-- Native Astro landing pages recorded in the CMS (A-133).
--
-- A native landing page is a file: `src/pages/<slug>.astro`, deployed with the
-- Worker. The file is the source of truth for whether it exists and what it
-- says. This column exists so the CMS can still *record* it — list it, link to
-- it, and let it take over a product page — without pretending it is editable.
--
-- The alternative was a second table holding native product-page claims. That
-- would have split the one invariant that matters: `landing_pages` already
-- carries a partial unique index guaranteeing at most one holder per product
-- page, and a second claim path would mean checking two places and trusting
-- them to agree. Keeping both kinds in one table keeps one index in charge.
--
-- It also closes a hazard: `slug` is UNIQUE here, so a native page registered
-- in this table can no longer be silently shadowed by an operator creating a
-- CMS page with the same slug, which Astro would have resolved to the file
-- with no warning anywhere.
ALTER TABLE `landing_pages`
  ADD `source` text DEFAULT 'cms' NOT NULL;
