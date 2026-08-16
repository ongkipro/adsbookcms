import { getRuntimeEnv } from "./env.ts";
import { CMS_VERSION } from "./version.ts";

/**
 * `wrangler d1 migrations apply` records one row per applied file in a table it
 * owns. Verified against the local D1 on 2026-08-16:
 *
 *   CREATE TABLE "d1_migrations"(
 *     id         INTEGER PRIMARY KEY AUTOINCREMENT,
 *     name       TEXT UNIQUE,
 *     applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)
 *
 * `name` holds the file name (`0000_futuristic_talisman.sql`), so the row count
 * is the number of migrations the database has actually applied. `MAX(id)` is
 * not used: the column is an autoincrement surrogate, not a chain position.
 */
export const D1_MIGRATIONS_TABLE = "d1_migrations";

export type SchemaVersionState =
  | "match"
  | "database-behind"
  | "database-ahead"
  | "unknown";

export type SchemaVersionStatus = {
  state: SchemaVersionState;
  /** What this bundle was built against: `CMS_VERSION.schemaVersion`. */
  expected: number;
  /** Rows in `d1_migrations`, or null when the count could not be read. */
  applied: number | null;
};

export function compareSchemaVersion(
  expected: number,
  applied: number | null,
): SchemaVersionStatus {
  if (applied === null || !Number.isInteger(applied) || applied < 0) {
    return { state: "unknown", expected, applied: null };
  }
  if (applied === expected) return { state: "match", expected, applied };
  return {
    state: applied < expected ? "database-behind" : "database-ahead",
    expected,
    applied,
  };
}

export async function readAppliedMigrationCount(
  database: D1Database,
): Promise<number | null> {
  try {
    const row = await database
      .prepare(`SELECT COUNT(*) AS applied FROM ${D1_MIGRATIONS_TABLE}`)
      .first<{ applied: number }>();
    const applied = Number(row?.applied);
    return Number.isInteger(applied) ? applied : null;
  } catch (error) {
    // The table is missing on a database that was never migrated through
    // wrangler, which is itself the answer an operator needs.
    console.error("schema-version-unreadable", error);
    return null;
  }
}

/**
 * Cached for the lifetime of the isolate. Applied migrations only change when
 * an operator runs `wrangler d1 migrations apply`, and the bundle's expected
 * value is frozen at build time, so one query per isolate is enough. An
 * `unknown` result is deliberately not cached: a transient D1 failure would
 * otherwise pin the isolate to "cannot tell" until it is recycled.
 */
let cachedStatus: SchemaVersionStatus | null = null;

export async function getSchemaVersionStatus(
  locals?: App.Locals,
): Promise<SchemaVersionStatus> {
  if (cachedStatus) return cachedStatus;

  const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
  let applied: number | null = null;
  if (!database || typeof database !== "object") {
    console.error("schema-version-no-database-binding");
  } else {
    applied = await readAppliedMigrationCount(database);
  }

  const status = compareSchemaVersion(CMS_VERSION.schemaVersion, applied);
  if (status.state === "database-behind" || status.state === "database-ahead") {
    // Never thrown: a cosmetic drift must not take a working store offline.
    // The operator sees this in Workers Logs and on /admin/dashboard.
    console.error(
      "schema-version-mismatch",
      `expected ${status.expected}, applied ${status.applied}`,
    );
  }
  if (status.state !== "unknown") cachedStatus = status;
  return status;
}
