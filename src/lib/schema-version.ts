import { getRuntimeEnv } from "./env.ts";
import { CMS_VERSION } from "./version.ts";

export const D1_MIGRATIONS_TABLE = "d1_migrations";
export const SCHEMA_UPGRADE_ERROR_LABEL = "schema-upgrade-failed";

export type SchemaUpgradeErrorCode =
  | "SCHEMA_UPGRADE_NO_DATABASE"
  | "SCHEMA_UPGRADE_CHAIN_INVALID"
  | "SCHEMA_UPGRADE_DATABASE_AHEAD"
  | "SCHEMA_UPGRADE_HISTORY_UNKNOWN"
  | "SCHEMA_UPGRADE_READ_FAILED"
  | "SCHEMA_UPGRADE_APPLY_FAILED";

export class SchemaUpgradeError extends Error {
  readonly label = SCHEMA_UPGRADE_ERROR_LABEL;
  readonly code: SchemaUpgradeErrorCode;
  readonly expected: number;
  readonly applied: number | null;
  readonly migration: string | null;

  constructor(
    code: SchemaUpgradeErrorCode,
    expected: number,
    applied: number | null,
    migration: string | null = null,
  ) {
    super(code);
    this.name = "SchemaUpgradeError";
    this.code = code;
    this.expected = expected;
    this.applied = applied;
    this.migration = migration;
  }
}

export type MigrationSource = {
  name: string;
  sql: string;
};

export type SchemaVersionState =
  | "match"
  | "database-behind"
  | "database-ahead"
  | "history-invalid"
  | "upgrade-failed"
  | "unknown";

export type SchemaVersionStatus = {
  state: SchemaVersionState;
  expected: number;
  applied: number | null;
  errorCode?: SchemaUpgradeErrorCode;
};

export type SchemaUpgradeResult = SchemaVersionStatus & {
  state: "match";
  applied: number;
  upgraded: number;
};

async function loadBundledMigrations(): Promise<readonly MigrationSource[]> {
  // Vite's glob API does not exist in Node's focused test runtime. Keep the
  // production-only module behind this boundary so injected test chains remain
  // executable without weakening the Worker bundle.
  const { BUNDLED_MIGRATIONS } = await import("./bundled-migrations.ts");
  return BUNDLED_MIGRATIONS;
}

function withoutComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*(?:\n|$)/g, "")
    .trim();
}

function splitSqlChunk(
  sql: string,
  preserveTriggerBody: boolean,
): string[] {
  const statements: string[] = [];
  let start = 0;
  let quote: "'" | '"' | "`" | "]" | null = null;
  let lineComment = false;
  let blockComment = false;

  const push = (end: number, final = false) => {
    const statement = sql.slice(start, end).trim();
    const code = withoutComments(statement);
    if (code.replace(/;/g, "").trim()) {
      statements.push(statement);
    } else if (!final) {
      throw new Error("empty SQL statement");
    }
    start = end;
  };

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      const closing = quote === "]" ? "]" : quote;
      if (char === closing) {
        if (next === closing && quote !== "]") {
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (char === "-" && next === "-") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "[") {
      quote = "]";
      continue;
    }
    if (char === ";" && !preserveTriggerBody) push(index + 1);
  }

  if (quote || blockComment) {
    throw new Error("unterminated SQL quote or comment");
  }
  push(sql.length, true);
  return statements;
}

/**
 * Drizzle's `statement-breakpoint` keeps trigger bodies intact. Hand-authored
 * migration files may omit it, so ordinary statements are lexed on semicolons
 * while respecting strings, identifiers, and comments. Trigger chunks stay
 * whole: their internal statement terminators belong to CREATE TRIGGER.
 */
export function splitMigrationStatements(sql: string): string[] {
  const chunks = sql.split(/-->\s*statement-breakpoint\s*/gi);
  const statements: string[] = [];

  for (const chunk of chunks) {
    const code = withoutComments(chunk);
    if (!code) continue;
    const trigger = /^CREATE\s+(?:TEMP(?:ORARY)?\s+)?TRIGGER\b/i.test(code);
    if (trigger && !/END\s*;\s*$/i.test(code)) {
      throw new Error("unterminated SQL trigger");
    }
    statements.push(...splitSqlChunk(chunk, trigger));
  }
  if (statements.length === 0) throw new Error("empty migration");
  return statements;
}

function validateMigrationChain(
  migrations: readonly MigrationSource[],
  expected: number,
): readonly MigrationSource[] {
  const ordered = [...migrations].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  if (ordered.length !== expected) {
    throw new SchemaUpgradeError(
      "SCHEMA_UPGRADE_CHAIN_INVALID",
      expected,
      null,
    );
  }

  ordered.forEach((migration, index) => {
    const prefix = String(index).padStart(4, "0");
    try {
      if (
        !migration.name.endsWith(".sql") ||
        migration.name.slice(0, 4) !== prefix ||
        !migration.name.startsWith(`${prefix}_`) ||
        splitMigrationStatements(migration.sql).length === 0
      ) {
        throw new Error("invalid migration");
      }
    } catch {
      throw new SchemaUpgradeError(
        "SCHEMA_UPGRADE_CHAIN_INVALID",
        expected,
        null,
        migration.name,
      );
    }
  });
  return ordered;
}

type MigrationConnection = Pick<D1Database, "prepare" | "batch">;

function primaryConnection(database: D1Database): MigrationConnection {
  return typeof database.withSession === "function"
    ? database.withSession("first-primary")
    : database;
}

async function createMigrationTable(database: D1Database, expected: number) {
  try {
    await database
      .prepare(
        `CREATE TABLE IF NOT EXISTS ${D1_MIGRATIONS_TABLE} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
      )
      .run();
  } catch {
    throw new SchemaUpgradeError("SCHEMA_UPGRADE_READ_FAILED", expected, null);
  }
}

async function readAppliedMigrationNames(
  connection: MigrationConnection,
  expected: number,
): Promise<string[]> {
  try {
    const result = await connection
      .prepare(
        `SELECT name FROM ${D1_MIGRATIONS_TABLE} ORDER BY id ASC`,
      )
      .all<{ name: string }>();
    const names = (result.results ?? []).map((row) => row.name);
    if (names.some((name) => typeof name !== "string" || !name)) {
      throw new Error("invalid migration history");
    }
    return names;
  } catch (error) {
    if (error instanceof SchemaUpgradeError) throw error;
    throw new SchemaUpgradeError("SCHEMA_UPGRADE_READ_FAILED", expected, null);
  }
}

function assertKnownHistory(
  appliedNames: readonly string[],
  migrations: readonly MigrationSource[],
  expected: number,
) {
  if (appliedNames.length > migrations.length) {
    throw new SchemaUpgradeError(
      "SCHEMA_UPGRADE_DATABASE_AHEAD",
      expected,
      appliedNames.length,
    );
  }
  for (let index = 0; index < appliedNames.length; index += 1) {
    if (appliedNames[index] !== migrations[index]?.name) {
      throw new SchemaUpgradeError(
        "SCHEMA_UPGRADE_HISTORY_UNKNOWN",
        expected,
        appliedNames.length,
        appliedNames[index] ?? null,
      );
    }
  }
}

async function applyMigration(
  connection: MigrationConnection,
  migration: MigrationSource,
) {
  const claim = connection
    .prepare(`INSERT INTO ${D1_MIGRATIONS_TABLE} (name) VALUES (?)`)
    .bind(migration.name);
  const statements = splitMigrationStatements(migration.sql).map((sql) =>
    connection.prepare(sql),
  );

  // D1 batch statements run sequentially in one transaction. Claiming the
  // unique migration name first makes a competing boot abort before executing
  // schema SQL; any later statement failure rolls both schema and claim back.
  await connection.batch([claim, ...statements]);
}

async function runSchemaUpgrade(
  database: D1Database,
  migrations: readonly MigrationSource[],
  expected: number,
): Promise<SchemaUpgradeResult> {
  const ordered = validateMigrationChain(migrations, expected);
  await createMigrationTable(database, expected);

  let connection = primaryConnection(database);
  let appliedNames = await readAppliedMigrationNames(connection, expected);
  assertKnownHistory(appliedNames, ordered, expected);
  const initialCount = appliedNames.length;

  while (appliedNames.length < ordered.length) {
    const migration = ordered[appliedNames.length];
    try {
      await applyMigration(connection, migration);
      appliedNames = [...appliedNames, migration.name];
    } catch {
      // A competing isolate may have committed this migration after our read.
      // Re-read from the primary: only an exact known prefix counts as success.
      connection = primaryConnection(database);
      const latest = await readAppliedMigrationNames(connection, expected);
      assertKnownHistory(latest, ordered, expected);
      if (
        latest.length <= appliedNames.length ||
        latest[appliedNames.length] !== migration.name
      ) {
        throw new SchemaUpgradeError(
          "SCHEMA_UPGRADE_APPLY_FAILED",
          expected,
          latest.length,
          migration.name,
        );
      }
      appliedNames = latest;
    }
  }

  return {
    state: "match",
    expected,
    applied: appliedNames.length,
    upgraded: Math.max(0, appliedNames.length - initialCount),
  };
}

const readinessByDatabase = new WeakMap<object, Promise<SchemaUpgradeResult>>();

export async function ensureSchemaUpgraded(
  database: D1Database,
  options: {
    migrations?: readonly MigrationSource[];
    expected?: number;
    cache?: boolean;
  } = {},
): Promise<SchemaUpgradeResult> {
  if (!database || typeof database.prepare !== "function") {
    throw new SchemaUpgradeError(
      "SCHEMA_UPGRADE_NO_DATABASE",
      options.expected ?? CMS_VERSION.schemaVersion,
      null,
    );
  }

  const migrations =
    options.migrations ?? (await loadBundledMigrations());
  const expected = options.expected ?? CMS_VERSION.schemaVersion;
  const cache = options.cache ?? options.migrations === undefined;
  if (!cache) return runSchemaUpgrade(database, migrations, expected);

  const existing = readinessByDatabase.get(database as object);
  if (existing) return existing;

  const readiness = runSchemaUpgrade(database, migrations, expected).catch(
    (error) => {
      readinessByDatabase.delete(database as object);
      throw error;
    },
  );
  readinessByDatabase.set(database as object, readiness);
  return readiness;
}

export function statusFromSchemaError(error: unknown): SchemaVersionStatus {
  if (!(error instanceof SchemaUpgradeError)) {
    return {
      state: "unknown",
      expected: CMS_VERSION.schemaVersion,
      applied: null,
    };
  }

  const state: SchemaVersionState =
    error.code === "SCHEMA_UPGRADE_DATABASE_AHEAD"
      ? "database-ahead"
      : error.code === "SCHEMA_UPGRADE_HISTORY_UNKNOWN" ||
          error.code === "SCHEMA_UPGRADE_CHAIN_INVALID"
        ? "history-invalid"
        : error.code === "SCHEMA_UPGRADE_APPLY_FAILED"
          ? "upgrade-failed"
          : "unknown";
  return {
    state,
    expected: error.expected,
    applied: error.applied,
    errorCode: error.code,
  };
}

export async function getSchemaVersionStatus(
  locals?: App.Locals,
): Promise<SchemaVersionStatus> {
  const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
  if (!database || typeof database.prepare !== "function") {
    return statusFromSchemaError(
      new SchemaUpgradeError(
        "SCHEMA_UPGRADE_NO_DATABASE",
        CMS_VERSION.schemaVersion,
        null,
      ),
    );
  }

  try {
    return await ensureSchemaUpgraded(database);
  } catch (error) {
    return statusFromSchemaError(error);
  }
}
