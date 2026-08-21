import type { MigrationSource } from "./schema-version.ts";

/**
 * Vite expands this glob at build time, embedding every checked-in migration in
 * the Worker without a hand-maintained registry. This module is loaded only
 * when the runtime needs the production migration chain; Node tests inject
 * their own focused chains and therefore never evaluate Vite's glob API.
 */
const migrationModules = import.meta.glob("../db/migrations/*.sql", {
  eager: true,
  import: "default",
  query: "?raw",
});

export const BUNDLED_MIGRATIONS: readonly MigrationSource[] = Object.entries(
  migrationModules,
)
  .map(([path, sql]) => ({
    name: path.slice(path.lastIndexOf("/") + 1),
    sql: String(sql),
  }))
  .sort((left, right) => left.name.localeCompare(right.name));
