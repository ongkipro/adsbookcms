-- Ninja left Mengantar's public API on 2026-09-01; 0056 disabled its courier
-- rule so an operator could see it switched off. Nothing quotes it any more and
-- no install recorded an order with it, so the rule itself goes. Only
-- courier_rules rows are removed: an order that ever named Ninja keeps its
-- courier_code, and its detail still shows the code as written.
DELETE FROM courier_rules WHERE lower(courier_code) = 'ninja';
