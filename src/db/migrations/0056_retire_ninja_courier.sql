-- Mengantar discontinued Ninja from its public API on 2026-09-01: "no longer
-- available on the Mengantar public API... do not rely on it." Existing
-- orders placed before the cutoff stay queryable, but offering it as an
-- active courier now quotes nothing. Disable rather than delete the row, so
-- an operator's own configuration (COD flag, excluded provinces) is not lost
-- if Mengantar ever restores it.
UPDATE courier_rules
SET is_enabled = 0
WHERE courier_code = 'Ninja' AND is_enabled = 1;
