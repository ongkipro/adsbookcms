-- AdsBookCMS demo seed — Permata Mall dataset (ADR-011).
--
-- Run with:  npm run db:reset:demo:local
--
-- DESTRUCTIVE. This is a reset, not an additive seed: it clears the catalog and
-- rewrites it to a known state so the demo dataset is always exactly these 22
-- products and 110 variants. Anything a merchant has added to `products` or
-- `product_variants` is removed. Order history is never touched: rows that an
-- `order_items` row still references are kept (and refreshed by the upserts
-- below), so the order_items -> product_variants foreign key cannot break.
--
-- The store, warehouse, and courier rows are `INSERT OR IGNORE`: a configured
-- install keeps its own values. Every provider-specific field ships as an
-- obvious placeholder. Shipping quotes will not work until a real Mengantar
-- area id, pickup address id, and contact details are set in the admin.

PRAGMA foreign_keys = ON;

-- 1. Store, warehouse, and courier bootstrap -------------------------------

INSERT OR IGNORE INTO stores (
  id, name, slug, mengantar_api_key, autolaris_api_key, meta_pixel_id,
  meta_capi_token, google_ads_conversion_id, google_ads_conversion_label, created_at
) VALUES (
  1, 'Permata Mall', 'permatamall', NULL, NULL, NULL, NULL, NULL, NULL, '2026-08-01T08:00:00.000Z'
);

INSERT OR IGNORE INTO warehouses (
  id, store_id, name, origin_area_id, origin_label, pickup_address_id, address, city, province
) VALUES (
  1, 1, 'Gudang Contoh',
  'REPLACE_WITH_MENGANTAR_AREA_ID', 'ISI DARI ADMIN — BELUM DIKONFIGURASI',
  'REPLACE_WITH_MENGANTAR_PICKUP_ADDRESS_ID',
  'Jl. Contoh No. 1', 'KOTA CONTOH', 'PROVINSI CONTOH'
);

UPDATE stores
SET support_whatsapp = COALESCE(support_whatsapp, '6280000000000')
WHERE id = 1;

UPDATE warehouses
SET contact_name = COALESCE(contact_name, 'Admin Contoh'),
    contact_phone = COALESCE(contact_phone, '080000000000')
WHERE id = 1;

INSERT OR IGNORE INTO courier_rules (
  id, store_id, courier_code, is_enabled, is_cod_enabled, excluded_provinces
) VALUES
  (1, 1, 'JNE', 1, 1, 'papua,papua barat,papua tengah,papua pegunungan,papua selatan'),
  (2, 1, 'SiCepat', 1, 1, 'papua pegunungan,papua selatan'),
  (3, 1, 'J&T', 1, 1, 'papua pegunungan'),
  (4, 1, 'SAP', 1, 1, 'papua,maluku utara'),
  (5, 1, 'Ninja', 1, 1, 'papua pegunungan'),
  (6, 1, 'Anteraja', 1, 1, 'papua pegunungan,papua selatan'),
  (7, 1, 'Lion', 1, 1, 'papua pegunungan'),
  (8, 1, 'IDexpress', 1, 1, 'papua pegunungan'),
  (9, 1, 'Paxel', 1, 0, 'papua,maluku,nusa tenggara timur'),
  (10, 1, 'Pos', 1, 1, 'papua pegunungan');

-- 2. Catalog reset ----------------------------------------------------------
-- Clear everything an order does not depend on, then upsert the demo rows.
-- The upserts (rather than plain inserts) exist so an order-referenced row that
-- survived the delete is refreshed in place instead of colliding on its id.

DELETE FROM product_variants
WHERE NOT EXISTS (
  SELECT 1 FROM order_items WHERE order_items.variant_id = product_variants.id
);

DELETE FROM products
WHERE NOT EXISTS (
  SELECT 1 FROM product_variants WHERE product_variants.product_id = products.id
);

INSERT INTO products (
  id, store_id, title, slug, category, is_active, image_url, created_at
) VALUES
  (1, 1, 'ZIVIA Tote Bag Wanita Premium', 'zivia-tote-bag-wanita-premium', 'Tote Bag', 1, '/images/products/zivia-tote-bag-wanita-premium/1.webp', '2026-08-15T06:27:56.305Z'),
  (2, 1, 'AIRA Tote Bag 2-in-1 Korean Style', 'aira-tote-bag-2in1-korean-style', 'Tote Bag', 1, '/images/products/aira-tote-bag-2in1-korean-style/1.webp', '2026-08-15T06:27:56.305Z'),
  (3, 1, 'CANDY Tote Bag Zipper Premium', 'candy-tote-bag-zipper-premium', 'Tote Bag', 1, '/images/products/candy-tote-bag-zipper-premium/1.webp', '2026-08-15T06:27:56.305Z'),
  (4, 1, 'AMARA Tote Bag Elegance Lock & Zipper', 'amara-tote-bag-elegance-lock-zipper', 'Tote Bag', 1, '/images/products/amara-tote-bag-elegance-lock-zipper/1.webp', '2026-08-15T06:27:56.305Z'),
  (5, 1, 'NOURA Tas Selempang Mini Chic', 'noura-tas-selempang-mini-chic', 'Tas Selempang', 1, '/images/products/noura-tas-selempang-mini-chic/1.webp', '2026-08-15T06:27:56.305Z'),
  (6, 1, 'SORAYA Tote Bag Casual Minimalis', 'soraya-tote-bag-casual-minimalis', 'Tote Bag', 1, '/images/products/soraya-tote-bag-casual-minimalis/1.webp', '2026-08-15T06:27:56.305Z'),
  (7, 1, 'LENZY Tas Bahu Anyaman Tikar Elegan', 'lenzy-tas-bahu-anyaman-tikar-elegan', 'Tas Bahu', 1, '/images/products/lenzy-tas-bahu-anyaman-tikar-elegan/1.webp', '2026-08-15T06:27:56.305Z'),
  (8, 1, 'SHELIN Tas Selempang Sadel Korean Style', 'shelin-tas-selempang-sadel-korean-style', 'Tas Selempang', 1, '/images/products/shelin-tas-selempang-sadel-korean-style/1.webp', '2026-08-15T06:27:56.305Z'),
  (9, 1, 'LUNNA Tote Bag Korean Oversize', 'lunna-tote-bag-korean-oversize', 'Tote Bag', 1, '/images/products/lunna-tote-bag-korean-oversize/1.webp', '2026-08-15T06:27:56.305Z'),
  (10, 1, 'LUCKY Tote Bag Gagang Ganda Korea', 'lucky-tote-bag-gagang-ganda-korea', 'Tote Bag', 1, '/images/products/lucky-tote-bag-gagang-ganda-korea/1.webp', '2026-08-15T06:27:56.305Z'),
  (11, 1, 'KEISYA Tas Selempang Chic Colorblock', 'keisya-tas-selempang-chic-colorblock', 'Tas Selempang', 1, '/images/products/keisya-tas-selempang-chic-colorblock/1.webp', '2026-08-15T06:27:56.305Z'),
  (12, 1, 'JEMINA Tote Bag Minimalis 2-in-1', 'jemina-tote-bag-minimalis-2in1', 'Tote Bag', 1, '/images/products/jemina-tote-bag-minimalis-2in1/1.webp', '2026-08-15T06:27:56.305Z'),
  (13, 1, 'HALONA Tote Bag Double Lock System', 'halona-tote-bag-double-lock-system', 'Tote Bag', 1, '/images/products/halona-tote-bag-double-lock-system/1.webp', '2026-08-15T06:27:56.305Z'),
  (14, 1, 'EMIRA Tas Selempang & Handbag Dual Tone', 'emira-tas-selempang-handbag-dual-tone', 'Tas Selempang', 1, '/images/products/emira-tas-selempang-handbag-dual-tone/1.webp', '2026-08-15T06:27:56.305Z'),
  (15, 1, 'DILY Tote Bag Handle Bag Elegant', 'dily-tote-bag-handle-bag-elegant', 'Tote Bag', 1, '/images/products/dily-tote-bag-handle-bag-elegant/1.webp', '2026-08-15T06:27:56.305Z'),
  (16, 1, 'CAROLINE Tas Selempang Moon Bag Korea', 'caroline-tas-selempang-moon-bag-korea', 'Tas Selempang', 1, '/images/products/caroline-tas-selempang-moon-bag-korea/1.webp', '2026-08-15T06:27:56.305Z'),
  (17, 1, 'BERLYN Tas Selempang Crescent Elegance', 'berlyn-tas-selempang-crescent-elegance', 'Tas Selempang', 1, '/images/products/berlyn-tas-selempang-crescent-elegance/1.webp', '2026-08-15T06:27:56.305Z'),
  (18, 1, 'AYIEN Tote Bag Work & Campus', 'ayien-tote-bag-work-campus', 'Tote Bag', 1, '/images/products/ayien-tote-bag-work-campus/1.webp', '2026-08-15T06:27:56.305Z'),
  (19, 1, 'ARIELA Tas Selempang Leather Look', 'ariela-tas-selempang-leather-look', 'Tas Selempang', 1, '/images/products/ariela-tas-selempang-leather-look/1.webp', '2026-08-15T06:27:56.305Z'),
  (20, 1, 'ANGGUN Tote Bag Plaid Multi-Kompartemen', 'anggun-tote-bag-plaid-multi-kompartemen', 'Tote Bag', 1, '/images/products/anggun-tote-bag-plaid-multi-kompartemen/1.webp', '2026-08-15T06:27:56.305Z'),
  (21, 1, 'AJUNA Tas Bahu Korean Business Casual', 'ajuna-tas-bahu-korean-business-casual', 'Tas Bahu', 1, '/images/products/ajuna-tas-bahu-korean-business-casual/1.webp', '2026-08-15T06:27:56.305Z'),
  (22, 1, 'DAIRA Tas Selempang & Bahu Kanvas', 'daira-tas-selempang-bahu-kanvas', 'Tas Selempang', 1, '/images/products/daira-tas-selempang-bahu-kanvas/1.webp', '2026-08-15T06:27:56.305Z')
ON CONFLICT(id) DO UPDATE SET
  store_id = excluded.store_id,
  title = excluded.title,
  slug = excluded.slug,
  category = excluded.category,
  is_active = excluded.is_active,
  image_url = excluded.image_url,
  created_at = excluded.created_at;

INSERT INTO product_variants (
  id, product_id, sku, title, price, compare_price, weight_grams, stock
) VALUES
  (1, 1, 'SKU-ZIVIA-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (2, 1, 'SKU-ZIVIA-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (3, 1, 'SKU-ZIVIA-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (4, 1, 'SKU-ZIVIA-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (5, 1, 'SKU-ZIVIA-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100),
  (6, 2, 'SKU-AIRA-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (7, 2, 'SKU-AIRA-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (8, 2, 'SKU-AIRA-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (9, 2, 'SKU-AIRA-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (10, 2, 'SKU-AIRA-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100),
  (11, 3, 'SKU-CANDY-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (12, 3, 'SKU-CANDY-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (13, 3, 'SKU-CANDY-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (14, 3, 'SKU-CANDY-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (15, 3, 'SKU-CANDY-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100),
  (16, 4, 'SKU-AMARA-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (17, 4, 'SKU-AMARA-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (18, 4, 'SKU-AMARA-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (19, 4, 'SKU-AMARA-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (20, 4, 'SKU-AMARA-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100),
  (21, 5, 'SKU-NOURA-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (22, 5, 'SKU-NOURA-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (23, 5, 'SKU-NOURA-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (24, 5, 'SKU-NOURA-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (25, 5, 'SKU-NOURA-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100),
  (26, 6, 'SKU-SORAYA-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (27, 6, 'SKU-SORAYA-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (28, 6, 'SKU-SORAYA-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (29, 6, 'SKU-SORAYA-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (30, 6, 'SKU-SORAYA-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100),
  (31, 7, 'SKU-LENZY-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (32, 7, 'SKU-LENZY-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (33, 7, 'SKU-LENZY-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (34, 7, 'SKU-LENZY-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (35, 7, 'SKU-LENZY-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100),
  (36, 8, 'SKU-SHELIN-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (37, 8, 'SKU-SHELIN-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (38, 8, 'SKU-SHELIN-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (39, 8, 'SKU-SHELIN-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (40, 8, 'SKU-SHELIN-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100),
  (41, 9, 'SKU-LUNNA-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (42, 9, 'SKU-LUNNA-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (43, 9, 'SKU-LUNNA-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (44, 9, 'SKU-LUNNA-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (45, 9, 'SKU-LUNNA-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100),
  (46, 10, 'SKU-LUCKY-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (47, 10, 'SKU-LUCKY-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (48, 10, 'SKU-LUCKY-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (49, 10, 'SKU-LUCKY-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (50, 10, 'SKU-LUCKY-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100),
  (51, 11, 'SKU-KEISYA-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (52, 11, 'SKU-KEISYA-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (53, 11, 'SKU-KEISYA-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (54, 11, 'SKU-KEISYA-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (55, 11, 'SKU-KEISYA-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100),
  (56, 12, 'SKU-JEMINA-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (57, 12, 'SKU-JEMINA-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (58, 12, 'SKU-JEMINA-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (59, 12, 'SKU-JEMINA-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (60, 12, 'SKU-JEMINA-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100),
  (61, 13, 'SKU-HALONA-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (62, 13, 'SKU-HALONA-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (63, 13, 'SKU-HALONA-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (64, 13, 'SKU-HALONA-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (65, 13, 'SKU-HALONA-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100),
  (66, 14, 'SKU-EMIRA-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (67, 14, 'SKU-EMIRA-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (68, 14, 'SKU-EMIRA-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (69, 14, 'SKU-EMIRA-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (70, 14, 'SKU-EMIRA-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100),
  (71, 15, 'SKU-DILY-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (72, 15, 'SKU-DILY-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (73, 15, 'SKU-DILY-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (74, 15, 'SKU-DILY-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (75, 15, 'SKU-DILY-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100),
  (76, 16, 'SKU-CAROLINE-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (77, 16, 'SKU-CAROLINE-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (78, 16, 'SKU-CAROLINE-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (79, 16, 'SKU-CAROLINE-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (80, 16, 'SKU-CAROLINE-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100),
  (81, 17, 'SKU-BERLYN-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (82, 17, 'SKU-BERLYN-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (83, 17, 'SKU-BERLYN-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (84, 17, 'SKU-BERLYN-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (85, 17, 'SKU-BERLYN-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100),
  (86, 18, 'SKU-AYIEN-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (87, 18, 'SKU-AYIEN-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (88, 18, 'SKU-AYIEN-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (89, 18, 'SKU-AYIEN-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (90, 18, 'SKU-AYIEN-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100),
  (91, 19, 'SKU-ARIELA-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (92, 19, 'SKU-ARIELA-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (93, 19, 'SKU-ARIELA-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (94, 19, 'SKU-ARIELA-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (95, 19, 'SKU-ARIELA-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100),
  (96, 20, 'SKU-ANGGUN-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (97, 20, 'SKU-ANGGUN-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (98, 20, 'SKU-ANGGUN-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (99, 20, 'SKU-ANGGUN-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (100, 20, 'SKU-ANGGUN-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100),
  (101, 21, 'SKU-AJUNA-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (102, 21, 'SKU-AJUNA-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (103, 21, 'SKU-AJUNA-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (104, 21, 'SKU-AJUNA-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (105, 21, 'SKU-AJUNA-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100),
  (106, 22, 'SKU-DAIRA-BLK', 'Warna Black', 128500, 300000, 500, 100),
  (107, 22, 'SKU-DAIRA-CRM', 'Warna Cream', 128500, 300000, 500, 100),
  (108, 22, 'SKU-DAIRA-MCC', 'Warna Mocca', 128500, 300000, 500, 100),
  (109, 22, 'SKU-DAIRA-BGD', 'Warna Burgundy', 128500, 300000, 500, 100),
  (110, 22, 'SKU-DAIRA-BDL2', 'Paket Hemat 2 Pcs (Bisa Pilih Warna)', 231300, 600000, 1000, 100)
ON CONFLICT(id) DO UPDATE SET
  product_id = excluded.product_id,
  sku = excluded.sku,
  title = excluded.title,
  price = excluded.price,
  compare_price = excluded.compare_price,
  weight_grams = excluded.weight_grams,
  stock = excluded.stock;
