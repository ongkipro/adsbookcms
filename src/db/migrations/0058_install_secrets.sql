-- Secrets the Worker generates for itself, so a one-click install needs no
-- hand-made random string. Today only `auth_secret`, the admin-session signing
-- key, created on first use when no AUTH_SECRET env secret is set (ADR-026).
-- Never read by any route that renders or returns data, and never exported.
CREATE TABLE IF NOT EXISTS install_secrets (
  name TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL
);
