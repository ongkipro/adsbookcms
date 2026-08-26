-- Admin sessions and rate-limit counters move from KV into D1 (ADR-021).
--
-- KV on the Workers Free plan allows 1,000 writes per day for the whole
-- Cloudflare account — every Worker on it shares the one allowance. Counting a
-- rate-limit window and creating a session were both KV writes, so the day the
-- account crossed that line every install answered `KV put() limit exceeded for
-- the day` to every kecamatan search and every admin login at once. A store of
-- record cannot live behind a shared daily quota; from here KV holds caches and
-- alert state only, and a failed KV write is logged, never fatal.
--
-- `admin_sessions` is the server-side half of the signed session cookie. The
-- JWT still carries identity and expiry; this row is what makes a session
-- revocable (logout, credential rotation, access removal) and what pins the
-- session to the credential revision it was issued against.
CREATE TABLE `admin_sessions` (
  `jti` text PRIMARY KEY NOT NULL,
  `username` text NOT NULL,
  `role` text NOT NULL,
  `must_change_password` integer DEFAULT 0 NOT NULL,
  `credential_updated_at` text NOT NULL,
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL
);
CREATE INDEX `admin_sessions_username_idx` ON `admin_sessions` (`username`);
CREATE INDEX `admin_sessions_expires_idx` ON `admin_sessions` (`expires_at`);

-- One row per (bucket, window). The upsert that spends from a window is a
-- single statement with RETURNING, so the count is exact under concurrency —
-- the KV get-then-put it replaces was not (A-71). Expired rows are purged by
-- the hourly scheduled maintenance.
CREATE TABLE `rate_limits` (
  `key` text PRIMARY KEY NOT NULL,
  `count` integer DEFAULT 0 NOT NULL,
  `reset_at` integer NOT NULL
);
CREATE INDEX `rate_limits_reset_idx` ON `rate_limits` (`reset_at`);
