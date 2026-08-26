/**
 * Server-side admin session records, stored in D1 (ADR-021).
 *
 * The cookie is a signed JWT (`src/lib/auth.ts`); this row is what makes that
 * token revocable. A session is active only while its row exists, has not
 * expired, and still matches the `admin_credentials` row it was issued
 * against — `updated_at` doubles as a credential revision, so rotating a
 * password or changing a role closes every session that predates it.
 *
 * This used to be a KV entry. KV writes count against a daily allowance
 * shared by every Worker on the Cloudflare account, and the day it ran out no
 * operator on any install could log in. Sessions are a store of record and
 * belong beside the credentials they reference.
 */
import {
  getSessionCookie,
  verifyJwt,
  type AdminRole,
  type AdminSession,
} from './auth.ts';

export type ActiveAdminSession = {
  username: string;
  role: AdminRole;
  mustChangePassword: boolean;
};

type StoredSessionRow = {
  username: string;
  role: string;
  must_change_password: number;
  credential_updated_at: string;
  current_updated_at: string | null;
  current_role: string | null;
};

export async function storeAdminSession(
  database: D1Database,
  session: AdminSession,
  credential: { mustChangePassword: boolean; updatedAt: string },
) {
  const now = new Date();
  // Expired rows are swept on the way in, so an install that never runs the
  // scheduled maintenance still cannot accumulate them.
  await database.batch([
    database
      .prepare('DELETE FROM admin_sessions WHERE expires_at <= ?')
      .bind(now.toISOString()),
    database
      .prepare(
        `INSERT INTO admin_sessions
           (jti, username, role, must_change_password, credential_updated_at, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        session.jti,
        session.username,
        session.role,
        credential.mustChangePassword ? 1 : 0,
        credential.updatedAt,
        new Date(session.exp * 1000).toISOString(),
        now.toISOString(),
      ),
  ]);
}

/**
 * The session record joined to its credential in one round trip. Returns null
 * for a missing, expired, mismatched, or superseded session — the caller does
 * not need to know which.
 */
export async function readActiveAdminSession(
  database: D1Database,
  session: AdminSession,
): Promise<ActiveAdminSession | null> {
  const row = await database
    .prepare(
      `SELECT s.username, s.role, s.must_change_password, s.credential_updated_at,
              c.updated_at AS current_updated_at, c.role AS current_role
         FROM admin_sessions s
         LEFT JOIN admin_credentials c ON c.username = s.username
        WHERE s.jti = ? AND s.expires_at > ?
        LIMIT 1`,
    )
    .bind(session.jti, new Date().toISOString())
    .first<StoredSessionRow>();
  if (!row) return null;
  if (row.username !== session.username || row.role !== session.role) return null;
  if (
    row.current_updated_at === null ||
    row.current_updated_at !== row.credential_updated_at ||
    row.current_role !== session.role
  ) {
    return null;
  }
  return {
    username: row.username,
    role: session.role,
    mustChangePassword: row.must_change_password === 1,
  };
}

/** Cookie → verified token → active record. Any failure along the way is "not signed in". */
export async function resolveAdminSession(
  database: D1Database | undefined,
  request: Request,
  secret: string,
): Promise<ActiveAdminSession | null> {
  if (!database) return null;
  const token = getSessionCookie(request);
  const session = token ? await verifyJwt(token, secret) : null;
  if (!session) return null;
  try {
    return await readActiveAdminSession(database, session);
  } catch (error) {
    console.error('admin-session-read-failed', error);
    return null;
  }
}

export async function deleteAdminSession(database: D1Database, jti: string) {
  await database.prepare('DELETE FROM admin_sessions WHERE jti = ?').bind(jti).run();
}

/** Every session, or every session of one operator. Used on rotation and access removal. */
export async function revokeAdminSessions(database: D1Database, username?: string) {
  if (username) {
    await database
      .prepare('DELETE FROM admin_sessions WHERE username = ?')
      .bind(username)
      .run();
    return;
  }
  await database.prepare('DELETE FROM admin_sessions').run();
}
