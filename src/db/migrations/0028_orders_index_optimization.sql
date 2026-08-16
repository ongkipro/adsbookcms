CREATE INDEX IF NOT EXISTS idx_orders_shipping_created ON orders(shipping_status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
