-- Migration: Shorten abandoned order numbers to ABN-10000 format
UPDATE orders
SET order_number = 'ABN-' || (10000 + id)
WHERE order_number LIKE 'ABN-%' AND length(order_number) > 12;
