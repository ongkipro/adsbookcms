-- One validated checkout fingerprint may own only one live order during the
-- replay window. The application clears an expired or terminal claim in the
-- same D1 batch that creates its successor, while this index closes concurrent
-- submissions that arrive with different browser submit tokens.
ALTER TABLE orders ADD COLUMN checkout_fingerprint TEXT;
ALTER TABLE orders ADD COLUMN checkout_dedupe_expires_at TEXT;
CREATE UNIQUE INDEX orders_checkout_fingerprint_unique
  ON orders (checkout_fingerprint)
  WHERE checkout_fingerprint IS NOT NULL;
CREATE INDEX orders_checkout_dedupe_expires_idx
  ON orders (checkout_dedupe_expires_at);
