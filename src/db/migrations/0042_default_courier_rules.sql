-- Restore the neutral courier catalogue that was accidentally coupled to the
-- removed demo-product seed. Existing stores with any courier policy are left
-- exactly as configured; only a completely empty courier workspace is repaired.
WITH defaults(courier_code, is_enabled, is_cod_enabled) AS (
  VALUES
    ('JNE', 1, 1),
    ('SiCepat', 1, 1),
    ('J&T', 1, 1),
    ('SAP', 1, 1),
    ('Ninja', 1, 1),
    ('Anteraja', 1, 1),
    ('Lion', 1, 1),
    ('IDexpress', 1, 1),
    ('Paxel', 1, 0),
    ('Pos', 1, 1)
)
INSERT INTO courier_rules (
  store_id,
  courier_code,
  is_enabled,
  is_cod_enabled,
  excluded_provinces
)
SELECT
  stores.id,
  defaults.courier_code,
  defaults.is_enabled,
  defaults.is_cod_enabled,
  NULL
FROM stores
CROSS JOIN defaults
WHERE NOT EXISTS (
  SELECT 1 FROM courier_rules WHERE courier_rules.store_id = stores.id
);
