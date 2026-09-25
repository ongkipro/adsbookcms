import { getEnvValue } from "./env.ts";

/**
 * The key admin sessions are signed with.
 *
 * An `AUTH_SECRET` Worker secret of 32+ characters wins, so every install that
 * already sets one keeps its sessions. Without it — a one-click install, where
 * asking an operator to invent a 32-character random string is exactly the
 * ceremony the installer exists to remove — the Worker generates 256 random
 * bits once, keeps them in `install_secrets`, and uses those (ADR-026). Setting
 * the env secret later simply takes over, which signs every operator out once.
 *
 * `INSERT OR IGNORE` then `SELECT` makes two first requests agree on one key.
 * Cached per database binding: the value never changes once written, and the
 * middleware would otherwise read it on every admin request.
 */
const cache = new WeakMap<D1Database, string>();

function randomSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function resolveAuthSecret(
  env: Parameters<typeof getEnvValue>[1],
  database: D1Database | undefined,
): Promise<string> {
  const configured = getEnvValue("AUTH_SECRET", env);
  if (configured.length >= 32) return configured;
  if (!database) return configured;

  const cached = cache.get(database);
  if (cached) return cached;

  try {
    const read = () =>
      database
        .prepare("SELECT value FROM install_secrets WHERE name = 'auth_secret'")
        .first<{ value: string }>();
    let row = await read();
    if (!row?.value) {
      await database
        .prepare(
          "INSERT OR IGNORE INTO install_secrets (name, value, created_at) VALUES ('auth_secret', ?, ?)",
        )
        .bind(randomSecret(), new Date().toISOString())
        .run();
      row = await read();
    }
    if (row?.value && row.value.length >= 32) {
      cache.set(database, row.value);
      return row.value;
    }
  } catch (error) {
    // Fail closed: an empty secret makes login answer 503 and every session
    // read return null. Never fall back to a guessable key.
    console.error("auth-secret-unavailable", error);
  }
  return configured;
}
