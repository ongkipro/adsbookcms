-- Keep legacy HTML/form rows intact while adding bounded CMS section types.
-- SQLite cannot alter a CHECK constraint, so replace the table in one forward migration.
PRAGMA foreign_keys = OFF;

CREATE TABLE landing_sections_next (
  id TEXT PRIMARY KEY,
  landing_page_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK(type IN ('html', 'form', 'headline', 'paragraph', 'numbered_list', 'bullet_list', 'image')),
  content_html TEXT,
  form_config TEXT,
  content_config TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (landing_page_id) REFERENCES landing_pages(id) ON DELETE CASCADE
);

INSERT INTO landing_sections_next (
  id, landing_page_id, sort_order, type, content_html, form_config, content_config, created_at, updated_at
)
SELECT id, landing_page_id, sort_order, type, content_html, form_config, NULL, created_at, updated_at
FROM landing_sections;

DROP TABLE landing_sections;
ALTER TABLE landing_sections_next RENAME TO landing_sections;
CREATE INDEX idx_landing_sections_page ON landing_sections(landing_page_id, sort_order);

PRAGMA foreign_keys = ON;
