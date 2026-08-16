PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS landing_pages (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  product_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  meta_title TEXT,
  meta_description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS landing_sections (
  id TEXT PRIMARY KEY,
  landing_page_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK(type IN ('html', 'form')),
  content_html TEXT,
  form_config TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (landing_page_id) REFERENCES landing_pages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_landing_pages_slug ON landing_pages(slug);
CREATE INDEX IF NOT EXISTS idx_landing_sections_page
  ON landing_sections(landing_page_id, sort_order);
