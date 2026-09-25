-- Mengantar began quoting SPX (Shopee Express) as `spx` in
-- /order/estimate?courier=all before its documentation listed it (observed
-- 2026-09-25; create-order support confirmed by Mengantar). Quotes are
-- filtered through courier_rules, so without a row SPX is silently dropped.
-- Add it to every store that already has a courier policy and no SPX row.
-- A store with an empty policy is left to the install bootstrap, which seeds
-- SPX with the rest of DEFAULT_COURIER_RULES.
INSERT INTO courier_rules (
  store_id,
  courier_code,
  is_enabled,
  is_cod_enabled,
  excluded_provinces
)
SELECT stores.id, 'SPX', 1, 1, NULL
FROM stores
WHERE EXISTS (
  SELECT 1 FROM courier_rules WHERE courier_rules.store_id = stores.id
)
AND NOT EXISTS (
  SELECT 1 FROM courier_rules
  WHERE courier_rules.store_id = stores.id
    AND lower(courier_rules.courier_code) = 'spx'
);
